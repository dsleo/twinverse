import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("POST /api/lab/runs", () => {
  it("returns 400 for malformed JSON", async () => {
    const { POST } = await import("./route");
    const request = {
      json: vi.fn(async () => {
        throw new SyntaxError("bad json");
      }),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Malformed JSON body." });
  });

  it("returns 422 for an invalid request payload", async () => {
    const { POST } = await import("./route");
    const request = {
      json: vi.fn(async () => ({ rawInput: "short", mode: "manual" })),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request payload." });
  });

  it("returns 503 when the Le Figaro daily question is unavailable", async () => {
    vi.doMock("../../../../server/lab/dailyQuestion", () => ({
      resolveLeFigaroDailyQuestion: vi.fn(async () => ({
        status: "unavailable",
        source: "le_figaro",
        message: "no question",
      })),
    }));

    const { POST } = await import("./route");
    const request = {
      json: vi.fn(async () => ({ mode: "le_figaro_daily" })),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Today’s Le Figaro question is unavailable." });
  });

  it("returns 202 and schedules background execution for a valid run", async () => {
    const executeLabRun = vi.fn(async () => undefined);
    const createLabRun = vi.fn(async () => ({ id: "lab-123" }));
    const afterMock = vi.fn(async (callback: () => Promise<void>) => {
      await callback();
    });

    vi.doMock("next/server", async () => {
      const actual = await vi.importActual<typeof import("next/server")>("next/server");
      return {
        ...actual,
        after: afterMock,
      };
    });
    vi.doMock("../../../../server/lab/pipeline", () => ({
      createLabRun,
      executeLabRun,
    }));

    const { POST } = await import("./route");
    const request = {
      json: vi.fn(async () => ({
        mode: "manual",
        rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
        inputType: "question",
      })),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ runId: "lab-123" });
    expect(createLabRun).toHaveBeenCalledOnce();
    expect(afterMock).toHaveBeenCalledOnce();
    expect(executeLabRun).toHaveBeenCalledWith("lab-123");
  });
});
