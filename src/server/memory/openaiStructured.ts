import "server-only";

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";

type StructuredCallParams<T> = {
  schema: ZodType<T>;
  schemaName: string;
  system: string;
  user: string;
  stageName: string;
  maxRetries?: number;
};

export type StructuredCallResult<T> = {
  data: T;
  diagnostics: {
    name: string;
    model: string;
    responseId?: string;
    outputText: string;
  };
};

let cachedClient: OpenAI | null = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Add it to .env.local before running the real memory pipeline.");
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
}: StructuredCallParams<T>): Promise<StructuredCallResult<T>> {
  const client = getClient();
  const model = getModel();
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
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

      return {
        data: message.parsed,
        diagnostics: {
          name: stageName,
          model,
          responseId: completion.id,
          outputText: extractOutputText(message.content) || JSON.stringify(message.parsed),
        },
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${stageName} failed after retries.`);
}
