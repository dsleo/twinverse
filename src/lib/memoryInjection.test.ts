import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personas } from "../data/mockData";
import { executeMemoryInjection, readStoredRuns } from "./memoryInjection";

const originalFetch = globalThis.fetch;
const storage = new Map<string, string>();

function mockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

beforeEach(() => {
  storage.clear();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("memoryInjection retrieval", () => {
  it("uses GDELT articles and Le Figaro question du jour content when available", async () => {
    const gdeltUrl = "https://api.gdeltproject.org/api/v2/doc/doc";
    const figaroUrl = "https://video.lefigaro.fr/figaro/la-question-du-jour/";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith(gdeltUrl)) {
          return mockResponse({
            articles: [
              {
                title: "GDELT article title",
                url: "https://example.com/gdelt-article",
                seendate: "2026-06-03 10:00:00",
                domain: "example.com",
                snippet: "A recent French policy story",
              },
            ],
          });
        }
        if (url === figaroUrl) {
          return mockResponse(`
            <html>
              <body>
                <h1>Le Figaro - La Question du Jour</h1>
                <p>La Question du Jour porte sur le nucléaire et l'énergie.</p>
              </body>
            </html>
          `);
        }
        return mockResponse({}, false, 404);
      }) as unknown as typeof fetch,
    );

    const run = await executeMemoryInjection({
      rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
      inputType: "question",
    });

    expect(run.status).toBe("completed");
    expect(run.retrievedSources.length).toBeGreaterThan(0);
    expect(run.retrievedSources.some((source) => source.provider === "gdelt" && source.title === "GDELT article title")).toBe(true);
    expect(run.retrievedSources.some((source) => source.title === "Le Figaro - La Question du Jour")).toBe(true);
    expect(run.contextPacks.length).toBeGreaterThan(0);
    expect(run.reactions).toHaveLength(Math.min(20, personas.length));
    expect(run.aggregateReport?.caveats).toContain("This is a synthetic simulation.");

    const stored = readStoredRuns();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(run.id);
  });

  it("falls back to synthetic results when external retrieval fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    );

    const run = await executeMemoryInjection({
      rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
      inputType: "question",
    });

    expect(run.status).toBe("completed");
    expect(run.retrievedSources.length).toBeGreaterThan(0);
    expect(run.retrievedSources.every((source) => source.url?.startsWith("https://example.com/"))).toBe(true);
    expect(run.reactions).toHaveLength(Math.min(20, personas.length));
  });
});
