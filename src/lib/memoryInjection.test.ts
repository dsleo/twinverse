import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    const gdeltUrl = "/proxy/gdelt";
    const figaroUrl = "/proxy/lefigaro";
    const wikipediaSearchUrl = "/proxy/wikipedia-search";
    const wikipediaSummaryUrl = "/proxy/wikipedia-summary";
    const googleNewsUrl = "/proxy/google-news-rss";
    const redditUrl = "/proxy/reddit-search";
    const googleTrendsUrl = "/proxy/google-trends-daily";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes(gdeltUrl)) {
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
        if (url.includes(googleNewsUrl)) {
          return mockResponse(`
            <rss><channel>
              <item>
                <title>Nucléaire : nouvelle séquence politique</title>
                <link>https://news.example.com/nucleaire</link>
                <description>Une synthèse des récents articles sur le nucléaire.</description>
                <pubDate>Wed, 04 Jun 2026 10:00:00 GMT</pubDate>
              </item>
            </channel></rss>
          `);
        }
        if (url.includes(redditUrl)) {
          return mockResponse({
            data: {
              children: [
                {
                  data: {
                    title: "Débat sur les centrales nucléaires en France",
                    selftext: "Discussion publique sur les coûts et la sécurité.",
                    permalink: "/r/france/comments/abc123/nucleaire/",
                    subreddit_name_prefixed: "r/france",
                    created_utc: 1780567200,
                  },
                },
              ],
            },
          });
        }
        if (url.includes(googleTrendsUrl)) {
          return mockResponse(`)]}',
            {"default":{"trendingSearchesDays":[{"trendingSearches":[
              {"title":{"query":"centrale nucléaire"},"formattedTraffic":"20K+","articles":[{"title":"Le nucléaire remonte dans le débat public"}]}
            ]}]}}`);
        }
        if (url.includes(wikipediaSearchUrl)) {
          return mockResponse({
            query: {
              search: [
                {
                  title: "Énergie nucléaire en France",
                  snippet: "Résumé encyclopédique sur le nucléaire en France.",
                },
              ],
            },
          });
        }
        if (url.includes(wikipediaSummaryUrl)) {
          return mockResponse({
            title: "Énergie nucléaire en France",
            extract: "La France dispose d'un parc nucléaire majeur.",
            content_urls: {
              desktop: {
                page: "https://fr.wikipedia.org/wiki/%C3%89nergie_nucl%C3%A9aire_en_France",
              },
            },
          });
        }
        if (url.includes(figaroUrl)) {
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
    expect(run.retrievedSources.some((source) => source.provider === "wikipedia" && source.provenance === "live")).toBe(true);
    expect(run.retrievedSources.some((source) => source.provider === "rss" && source.provenance === "live")).toBe(true);
    expect(run.retrievedSources.some((source) => source.provider === "gdelt" && source.title === "GDELT article title")).toBe(true);
    expect(run.retrievedSources.some((source) => source.provider === "reddit" && source.provenance === "live")).toBe(true);
    expect(run.retrievedSources.some((source) => source.provider === "google_trends" && source.provenance === "live")).toBe(true);
    expect(run.contextPacks.length).toBeGreaterThan(0);
    expect(run.reactions).toHaveLength(20);
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
    expect(run.reactions).toHaveLength(20);
  });
});
