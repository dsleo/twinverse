import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeLabRun: vi.fn(),
  readRun: vi.fn(),
  verifyWorkerRequest: vi.fn(),
}));

vi.mock("../../../../server/lab/pipeline", () => ({
  executeLabRun: mocks.executeLabRun,
}));

vi.mock("../../../../server/lab/persistence", () => ({
  readRun: mocks.readRun,
}));

vi.mock("../../../../server/lab/qstash", () => ({
  verifyWorkerRequest: mocks.verifyWorkerRequest,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("POST /api/lab/worker", () => {
  it("rejects unsigned worker calls", async () => {
    mocks.verifyWorkerRequest.mockResolvedValue(false);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://example.com/api/lab/worker", {
        method: "POST",
        body: JSON.stringify({ runId: "lab-1" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.executeLabRun).not.toHaveBeenCalled();
  });

  it("skips duplicate deliveries for completed or running runs", async () => {
    mocks.verifyWorkerRequest.mockResolvedValue(true);
    mocks.readRun.mockResolvedValueOnce({ status: "running" }).mockResolvedValueOnce({ status: "completed" });

    const { POST } = await import("./route");
    const runningResponse = await POST(
      new Request("https://example.com/api/lab/worker", {
        method: "POST",
        body: JSON.stringify({ runId: "lab-running" }),
      }),
    );
    const completedResponse = await POST(
      new Request("https://example.com/api/lab/worker", {
        method: "POST",
        body: JSON.stringify({ runId: "lab-completed" }),
      }),
    );

    expect(runningResponse.status).toBe(200);
    expect(completedResponse.status).toBe(200);
    expect(mocks.executeLabRun).not.toHaveBeenCalled();
  });

  it("executes a created run once the request has been verified", async () => {
    mocks.verifyWorkerRequest.mockResolvedValue(true);
    mocks.readRun.mockResolvedValue({ status: "created" });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://example.com/api/lab/worker", {
        method: "POST",
        body: JSON.stringify({ runId: "lab-created" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.executeLabRun).toHaveBeenCalledWith("lab-created");
  });
});
