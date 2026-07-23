import { afterEach, describe, expect, it } from "vitest";
import { readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRunRecord, listRuns, readRun, writeRun, RunStateCorruptError } from "./persistence";

const dataDir = path.join(process.cwd(), ".tmp-tests", "persistence");

afterEach(async () => {
  process.env.LAB_DATA_ROOT = dataDir;
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.LAB_DATA_ROOT;
});

describe("persistence", () => {
  it("writes runs atomically without leaving temp files behind", async () => {
    process.env.LAB_DATA_ROOT = dataDir;
    const run = await createRunRecord({
      input: {
        rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
        inputType: "question",
      },
      mode: "manual",
      audiencePreset: "france_general",
      promptSnapshot: "Faut-il construire de nouvelles centrales nucléaires en France ?",
    });

    await writeRun({
      ...run,
      status: "running",
    });

    const entries = await readdir(path.join(dataDir, "lab-runs"));
    expect(entries.filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
    expect(await readRun(run.id)).toMatchObject({ id: run.id, status: "running" });
    expect((await readRun(run.id)).audienceGuidance).toEqual({ mode: "automatic", include: [], avoid: [], priorityConcerns: [] });
  });

  it("raises a corruption error for unreadable persisted run files", async () => {
    process.env.LAB_DATA_ROOT = dataDir;
    const run = await createRunRecord({
      input: {
        rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
        inputType: "question",
      },
      mode: "manual",
      audiencePreset: "france_general",
      promptSnapshot: "Faut-il construire de nouvelles centrales nucléaires en France ?",
    });

    await writeFile(path.join(dataDir, "lab-runs", `${run.id}.json`), "{not-valid-json", "utf8");

    await expect(readRun(run.id)).rejects.toBeInstanceOf(RunStateCorruptError);
  });

  it("skips corrupted run files when listing runs", async () => {
    process.env.LAB_DATA_ROOT = dataDir;
    const validRun = await createRunRecord({
      input: {
        rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
        inputType: "question",
      },
      mode: "manual",
      audiencePreset: "france_general",
      promptSnapshot: "Faut-il construire de nouvelles centrales nucléaires en France ?",
    });

    await writeFile(path.join(dataDir, "lab-runs", "corrupted-run.json"), "{broken", "utf8");

    const runs = await listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe(validRun.id);
  });
});
