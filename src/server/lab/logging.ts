import "server-only";

type LogDetails = Record<string, string | number | boolean | null | undefined>;

function formatDetails(details?: LogDetails) {
  if (!details || Object.keys(details).length === 0) {
    return "";
  }

  const payload = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
  return ` ${JSON.stringify(payload)}`;
}

export function logLabRun(runId: string, message: string, details?: LogDetails) {
  console.log(`[lab:${runId}] ${message}${formatDetails(details)}`);
}

export function logLabStage(
  runId: string,
  stageId: string,
  status: "running" | "completed" | "failed",
  details?: LogDetails,
) {
  console.log(`[lab:${runId}] stage=${stageId} status=${status}${formatDetails(details)}`);
}

export function logLabTokenTotals(
  runId: string,
  label: string,
  totals: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCalls: number;
  },
  task?: string,
) {
  console.log(`[lab:${runId}] ${label}${formatDetails({ task, ...totals })}`);
}
