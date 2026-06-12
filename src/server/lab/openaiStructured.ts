import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import { logLabRun } from "./logging";
import { normalizeTokenUsage, type TokenUsage } from "./tokenAccounting";

type StructuredCallParams<T> = {
  schema: ZodType<T>;
  schemaName: string;
  system: string;
  user: string;
  stageName: string;
  maxRetries?: number;
  runId?: string;
  traceLabel?: string;
};

export type StructuredCallResult<T> = {
  data: T;
  diagnostics: {
    name: string;
    model: string;
    responseId?: string;
    outputText: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    tokenUsageEstimated: boolean;
  };
  tokenUsage: TokenUsage;
};

let cachedClient: OpenAI | null = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Add it to .env.local before running the real lab pipeline.");
  }

  cachedClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return cachedClient;
}

function getModel() {
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

function extractOutputText(messageContent: unknown) {
  if (typeof messageContent === "string") {
    return messageContent;
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

export async function callStructuredModel<T>({
  schema,
  schemaName,
  system,
  user,
  stageName,
  maxRetries = 2,
  runId,
  traceLabel,
}: StructuredCallParams<T>): Promise<StructuredCallResult<T>> {
  const client = getClient();
  const model = getModel();
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      logLabRun(runId ?? "model", "llm-request-start", {
        stage: stageName,
        label: traceLabel,
        model,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
      });

      const completion = await client.chat.completions.parse({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: zodResponseFormat(schema, schemaName),
      });

      const message = completion.choices[0]?.message;
      if (!message?.parsed) {
        throw new Error(`${stageName} returned no structured payload.`);
      }

      const tokenUsage = normalizeTokenUsage(completion.usage, system, user, extractOutputText(message.content) || JSON.stringify(message.parsed));

      logLabRun(runId ?? "model", "llm-request-complete", {
        stage: stageName,
        label: traceLabel,
        model,
        responseId: completion.id,
        attempt: attempt + 1,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens,
        tokenUsageEstimated: tokenUsage.estimated,
      });

      return {
        data: message.parsed,
        tokenUsage,
        diagnostics: {
          name: stageName,
          model,
          responseId: completion.id,
          outputText: extractOutputText(message.content) || JSON.stringify(message.parsed),
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          totalTokens: tokenUsage.totalTokens,
          tokenUsageEstimated: tokenUsage.estimated,
        },
      };
    } catch (error) {
      lastError = error;
      logLabRun(runId ?? "model", "llm-request-failed", {
        stage: stageName,
        label: traceLabel,
        model,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logLabRun(runId ?? "model", "llm-request-aborted", {
    stage: stageName,
    label: traceLabel,
    model,
    attempts: maxRetries + 1,
  });
  throw lastError instanceof Error ? lastError : new Error(`${stageName} failed after retries.`);
}
