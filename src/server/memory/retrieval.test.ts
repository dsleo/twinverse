import { afterEach, describe, expect, it, vi } from "vitest";
import { retrieveSources } from "./retrieval";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("retrieveSources", () => {
  it("maps provider failures into explicit diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("wikipedia.org/w/api.php")) {
          return jsonResponse({ query: { search: [{ title: "Énergie nucléaire en France" }] } });
        }
        if (url.includes("wikipedia.org/api/rest_v1/page/summary")) {
          return jsonResponse({
            title: "Énergie nucléaire en France",
            extract: "La France dispose d'un parc nucléaire majeur.",
            content_urls: { desktop: { page: "https://fr.wikipedia.org/wiki/%C3%89nergie_nucl%C3%A9aire_en_France" } },
          });
        }
        if (url.includes("news.google.com/rss/search")) {
          return jsonResponse(
            "<rss><channel><item><title>Nucléaire relancé - Reuters</title><link>https://example.com/reuters</link><description>Débat relancé en France.</description><pubDate>Wed, 04 Jun 2026 10:00:00 GMT</pubDate></item></channel></rss>",
          );
        }
        if (url.includes("api.gdeltproject.org")) {
          return jsonResponse({ error: "rate limited" }, 429);
        }
        if (url.includes("www.reddit.com/search.json")) {
          return jsonResponse({ message: "blocked" }, 403);
        }
        if (url.includes("trends.google.com/trends/api/dailytrends")) {
          return jsonResponse({ message: "missing" }, 404);
        }
        return jsonResponse({}, 500);
      }) as unknown as typeof fetch,
    );

    const result = await retrieveSources({
      rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
      inputType: "question",
    });

    expect(result.outcomes.find((outcome) => outcome.provider === "gdelt")?.status).toBe("rate_limited");
    expect(result.outcomes.find((outcome) => outcome.provider === "reddit")?.status).toBe("blocked");
    expect(result.outcomes.find((outcome) => outcome.provider === "google_trends")?.status).toBe("upstream_failure");
    expect(result.sources.some((source) => source.provider === "wikipedia" && source.provenance === "live")).toBe(true);
    expect(result.sources.some((source) => source.provider === "rss" && source.provenance === "live")).toBe(true);
    expect(result.sources.some((source) => source.provider === "gdelt" && source.provenance === "fallback")).toBe(true);
  });
});
