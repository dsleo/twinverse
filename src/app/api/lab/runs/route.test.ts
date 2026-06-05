import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createLabRun: vi.fn(),
  executeLabRun: vi.fn(),
  listRuns: vi.fn(),
  resolveLeFigaroDailyQuestion: vi.fn(),
  enqueueLabRun: vi.fn(),
  isQstashConfigured: vi.fn(),
  isWorkerQueueRequired: vi.fn(),
}));

vi.mock("../../../../server/lab/pipeline", () => ({
  createLabRun: mocks.createLabRun,
  executeLabRun: mocks.executeLabRun,
}));

vi.mock("../../../../server/lab/persistence", () => ({
  listRuns: mocks.listRuns,
}));

vi.mock("../../../../server/lab/dailyQuestion", () => ({
  resolveLeFigaroDailyQuestion: mocks.resolveLeFigaroDailyQuestion,
}));

vi.mock("../../../../server/lab/qstash", () => ({
  enqueueLabRun: mocks.enqueueLabRun,
  isQstashConfigured: mocks.isQstashConfigured,
  isWorkerQueueRequired: mocks.isWorkerQueueRequired,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("POST /api/lab/runs", () => {
  it("creates a run and enqueues the worker when QStash is configured", async () => {
    mocks.createLabRun.mockResolvedValue({
      id: "lab-123",
      createdAt: "2026-06-05T08:00:00.000Z",
      updatedAt: "2026-06-05T08:00:00.000Z",
      status: "created",
      mode: "manual",
      audiencePreset: "france_general",
      input: {
        rawInput: "Faut-il accélérer la rénovation énergétique des logements ?",
        inputType: "question",
      },
      promptSnapshot: "Faut-il accélérer la rénovation énergétique des logements ?",
      steps: [],
      panel: [],
      contextPacks: [],
      reactions: [],
      rawModelDiagnostics: [],
    });
    mocks.isQstashConfigured.mockReturnValue(true);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://example.com/api/lab/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          rawInput: "Faut-il accélérer la rénovation énergétique des logements ?",
          inputType: "question",
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(mocks.enqueueLabRun).toHaveBeenCalledWith(expect.any(Request), "lab-123");
    expect(mocks.executeLabRun).not.toHaveBeenCalled();
  });

  it("fails fast when a worker queue is required but not configured", async () => {
    mocks.createLabRun.mockResolvedValue({
      id: "lab-456",
      createdAt: "2026-06-05T08:00:00.000Z",
      updatedAt: "2026-06-05T08:00:00.000Z",
      status: "created",
      mode: "manual",
      audiencePreset: "france_general",
      input: {
        rawInput: "Faut-il relancer le fret ferroviaire national ?",
        inputType: "question",
      },
      promptSnapshot: "Faut-il relancer le fret ferroviaire national ?",
      steps: [],
      panel: [],
      contextPacks: [],
      reactions: [],
      rawModelDiagnostics: [],
    });
    mocks.isQstashConfigured.mockReturnValue(false);
    mocks.isWorkerQueueRequired.mockReturnValue(true);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://example.com/api/lab/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          rawInput: "Faut-il relancer le fret ferroviaire national ?",
          inputType: "question",
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(mocks.executeLabRun).not.toHaveBeenCalled();
    expect(mocks.enqueueLabRun).not.toHaveBeenCalled();
  });
});
