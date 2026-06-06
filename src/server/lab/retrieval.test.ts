import { afterEach, describe, expect, it, vi } from "vitest";
import { buildQueries, retrieveSources } from "./retrieval";

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
        if (url.includes("www.reddit.com/search.json")) {
          return jsonResponse({ message: "blocked" }, 403);
        }
        if (url.includes("vie-publique.fr/actualites-feeds.xml")) {
          return jsonResponse({ message: "busy" }, 503);
        }
        if (url.includes("data.gouv.fr/api/1/datasets/")) {
          return jsonResponse({ message: "missing" }, 404);
        }
        return jsonResponse({}, 500);
      }) as unknown as typeof fetch,
    );

    const result = await retrieveSources({
      rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
      inputType: "question",
    });

    expect(result.outcomes.find((outcome) => outcome.provider === "reddit")?.status).toBe("blocked");
    expect(result.outcomes.find((outcome) => outcome.provider === "vie_publique")?.status).toBe("upstream_failure");
    expect(result.outcomes.find((outcome) => outcome.provider === "data_gouv")?.status).toBe("upstream_failure");
    expect(result.sources.some((source) => source.provider === "wikipedia" && source.provenance === "live")).toBe(true);
    expect(result.sources.some((source) => source.provider === "rss" && source.provenance === "live")).toBe(true);
    expect(result.sources.some((source) => source.provider === "vie_publique" && source.provenance === "fallback")).toBe(true);
    expect(result.sources.some((source) => source.provider === "data_gouv" && source.provenance === "fallback")).toBe(true);
  });

  it("classifies unreadable provider payloads as parse failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("wikipedia.org/w/api.php")) {
          return {
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError("bad json");
            },
          } as Response;
        }
        if (url.includes("news.google.com/rss/search")) {
          return jsonResponse(
            "<rss><channel><item><title>Nucléaire relancé - Reuters</title><link>https://example.com/reuters</link><description>Débat relancé en France.</description><pubDate>Wed, 04 Jun 2026 10:00:00 GMT</pubDate></item></channel></rss>",
          );
        }
        if (url.includes("www.reddit.com/search.json")) {
          return jsonResponse({ message: "blocked" }, 403);
        }
        if (url.includes("vie-publique.fr/actualites-feeds.xml")) {
          return jsonResponse({ message: "busy" }, 503);
        }
        if (url.includes("data.gouv.fr/api/1/datasets/")) {
          return jsonResponse({ data: [] });
        }
        return jsonResponse({}, 500);
      }) as unknown as typeof fetch,
    );

    const result = await retrieveSources({
      rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
      inputType: "question",
    });

    expect(result.outcomes.find((outcome) => outcome.provider === "wikipedia")?.status).toBe("parse_failure");
    expect(result.sources.some((source) => source.provider === "wikipedia" && source.provenance === "fallback")).toBe(true);
  });

  it("returns live official sources when the new providers match", async () => {
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
        if (url.includes("www.reddit.com/search.json")) {
          return jsonResponse({
            data: {
              children: [
                {
                  data: {
                    title: "Débat sur le nucléaire français",
                    selftext: "Beaucoup de questions sur les prix et la souveraineté énergétique.",
                    permalink: "/r/france/comments/abc123/debat_nucleaire/",
                    subreddit_name_prefixed: "r/france",
                    created_utc: 1780557600,
                  },
                },
              ],
            },
          });
        }
        if (url.includes("vie-publique.fr/actualites-feeds.xml")) {
          return jsonResponse(
            "<rss><channel><item><title>Nucléaire : quelles orientations pour la France ?</title><link>https://www.vie-publique.fr/article/nucleaire-france</link><description>Point officiel sur la stratégie énergétique et les arbitrages publics.</description><pubDate>Thu, 05 Jun 2026 08:00:00 GMT</pubDate></item><item><title>Réforme scolaire</title><link>https://www.vie-publique.fr/article/ecole</link><description>Un sujet sans rapport.</description><pubDate>Wed, 04 Jun 2026 08:00:00 GMT</pubDate></item></channel></rss>",
          );
        }
        if (url.includes("data.gouv.fr/api/1/datasets/")) {
          return jsonResponse({
            data: [
              {
                title: "Production nucléaire",
                page: "https://www.data.gouv.fr/datasets/production-nucleaire",
                description: "Série officielle sur la production nette d'électricité nucléaire française.",
                last_update: "2026-05-22T09:58:52+00:00",
                organization: { name: "Open Data Réseaux Énergies" },
                tags: ["nucleaire", "production", "energie"],
              },
              {
                title: "Comptes du tourisme",
                page: "https://www.data.gouv.fr/datasets/tourisme",
                description: "Jeu sans lien direct avec la requête.",
                last_update: "2026-05-01T00:00:00+00:00",
                organization: { name: "Ministère du tourisme" },
                tags: ["tourisme"],
              },
            ],
          });
        }
        return jsonResponse({}, 500);
      }) as unknown as typeof fetch,
    );

    const result = await retrieveSources({
      rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
      inputType: "question",
    });

    expect(result.outcomes.find((outcome) => outcome.provider === "vie_publique")?.status).toBe("success");
    expect(result.outcomes.find((outcome) => outcome.provider === "data_gouv")?.status).toBe("success");
    expect(result.sources.some((source) => source.provider === "vie_publique" && source.provenance === "live")).toBe(true);
    expect(result.sources.some((source) => source.provider === "data_gouv" && source.provenance === "live")).toBe(true);
    expect(result.sources.some((source) => source.provider === "data_gouv" && source.title === "Comptes du tourisme")).toBe(false);
  });

  it("builds the replacement provider query plan", () => {
    expect(
      buildQueries({
        rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
        inputType: "question",
      }).map((query) => query.provider),
    ).toEqual(["wikipedia", "rss", "reddit", "vie_publique", "data_gouv"]);
  });
});
