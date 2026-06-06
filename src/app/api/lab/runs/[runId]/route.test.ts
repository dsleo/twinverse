import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("GET /api/lab/runs/[runId]", () => {
  it("returns 404 only when the run is missing", async () => {
    vi.doMock("../../../../../server/lab/persistence", async () => {
      const actual = await vi.importActual<typeof import("../../../../../server/lab/persistence")>("../../../../../server/lab/persistence");
      return {
        ...actual,
        readRun: vi.fn(async () => {
          throw new actual.RunNotFoundError("lab-missing");
        }),
      };
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/lab/runs/lab-missing"), {
      params: Promise.resolve({ runId: "lab-missing" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Run not found." });
  });

  it("returns 500 when persisted run state is corrupted", async () => {
    vi.doMock("../../../../../server/lab/persistence", async () => {
      const actual = await vi.importActual<typeof import("../../../../../server/lab/persistence")>("../../../../../server/lab/persistence");
      return {
        ...actual,
        readRun: vi.fn(async () => {
          throw new actual.RunStateCorruptError("lab-corrupt");
        }),
      };
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/lab/runs/lab-corrupt"), {
      params: Promise.resolve({ runId: "lab-corrupt" }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Run state is unreadable." });
  });
});
