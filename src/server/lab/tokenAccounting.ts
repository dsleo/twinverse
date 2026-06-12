import "server-only";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimated: boolean;
};

export type CompletionUsageLike = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
} | null | undefined;

function approximateTokens(text: string) {
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateTokenUsage(system: string, user: string, outputText: string): TokenUsage {
  const inputTokens = approximateTokens(`${system}\n${user}`);
  const outputTokens = approximateTokens(outputText);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimated: true,
  };
}

export function normalizeTokenUsage(
  usage: CompletionUsageLike,
  system: string,
  user: string,
  outputText: string,
): TokenUsage {
  if (usage?.prompt_tokens !== undefined && usage?.completion_tokens !== undefined && usage?.total_tokens !== undefined) {
    return {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      estimated: false,
    };
  }

  return estimateTokenUsage(system, user, outputText);
}

export type TokenTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCalls: number;
  calls: number;
};

export function createTokenTotals(): TokenTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCalls: 0,
    calls: 0,
  };
}

export function addTokenUsage(totals: TokenTotals, usage: TokenUsage) {
  totals.inputTokens += usage.inputTokens;
  totals.outputTokens += usage.outputTokens;
  totals.totalTokens += usage.totalTokens;
  totals.calls += 1;
  if (usage.estimated) {
    totals.estimatedCalls += 1;
  }
}

