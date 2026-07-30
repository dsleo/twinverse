import { afterEach, describe, expect, it, vi } from "vitest";
import { buildQueries, buildRetrievalPlan, retrieveSources } from "./retrieval";

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
  vi.useRealTimers();
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
    expect(result.sources.some((source) => source.provider === "vie_publique")).toBe(false);
    expect(result.sources.some((source) => source.provider === "data_gouv")).toBe(false);
    expect(result.plan?.providerDecisions.find((decision) => decision.provider === "reddit")?.reason).toMatch(/discourse/i);
  });

  it("keeps distinct Google News links with a shared long prefix as distinct sources", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(
        "<rss><channel>" +
          "<item><title>Premier article - Média A</title><link>https://news.google.com/rss/articles/CBMi4GFshared-prefix-first</link><description>Premier résultat.</description><pubDate>Wed, 04 Jun 2026 10:00:00 GMT</pubDate></item>" +
          "<item><title>Second article - Média B</title><link>https://news.google.com/rss/articles/CBMi4GFshared-prefix-second</link><description>Second résultat.</description><pubDate>Wed, 04 Jun 2026 11:00:00 GMT</pubDate></item>" +
        "</channel></rss>",
      )) as unknown as typeof fetch,
    );

    const result = await retrieveSources(
      { rawInput: "Quels moyens aériens contre les incendies ?", inputType: "question" },
      {
        inputTerms: ["incendies"],
        providerDecisions: [{ provider: "rss", query: "moyens aériens incendies", segmentIds: ["segment-1"], reason: "Current fire-response reporting.", triggeredBy: ["segment-1"], confidence: 0.8 }],
        skippedProviders: [],
        queryVariants: ["moyens aériens incendies"],
      },
    );

    expect(result.sources).toHaveLength(2);
    expect(new Set(result.sources.map((source) => source.id)).size).toBe(2);
  });

  it("collapses an exact repeated source and retains every intended segment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(
        "<rss><channel><item><title>Canadair update - Média</title><link>https://news.google.com/rss/articles/same-item</link><description>Shared result.</description><pubDate>Wed, 04 Jun 2026 10:00:00 GMT</pubDate></item></channel></rss>",
      )) as unknown as typeof fetch,
    );

    const result = await retrieveSources(
      { rawInput: "Quels moyens aériens contre les incendies ?", inputType: "question" },
      {
        inputTerms: ["incendies"],
        providerDecisions: [
          { provider: "rss", query: "moyens aériens incendies", segmentIds: ["segment-1"], reason: "Current fire-response reporting.", triggeredBy: ["segment-1"], confidence: 0.8 },
          { provider: "rss", query: "Canadair incendies", segmentIds: ["segment-2"], reason: "Aircraft availability reporting.", triggeredBy: ["segment-2"], confidence: 0.8 },
        ],
        skippedProviders: [],
        queryVariants: ["moyens aériens incendies", "Canadair incendies"],
      },
    );

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.intendedSegmentIds).toEqual(["segment-1", "segment-2"]);
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
          } as unknown as Response;
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
    expect(result.sources.some((source) => source.provider === "wikipedia")).toBe(false);
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

  it("does not retain a generic Vie publique feed item without a topic match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(
        "<rss><channel><item><title>Politique publique : bilan annuel</title><link>https://www.vie-publique.fr/article/bilan</link><description>Les services publics et les moyens de l'État.</description><pubDate>Thu, 05 Jun 2026 08:00:00 GMT</pubDate></item></channel></rss>",
      )) as unknown as typeof fetch,
    );

    const result = await retrieveSources(
      { rawInput: "La lutte contre les incendies est-elle suffisamment financée ?", inputType: "question" },
      {
        inputTerms: ["incendies"],
        providerDecisions: [{ provider: "vie_publique", query: "politique publique incendies", segmentIds: ["segment-1"], reason: "Institutional fire policy.", triggeredBy: ["segment-1"], confidence: 0.8 }],
        skippedProviders: [],
        queryVariants: ["politique publique incendies"],
      },
    );

    expect(result.sources).toHaveLength(0);
    expect(result.outcomes[0]?.status).toBe("no_relevant_results");
  });

  it("records a provider timeout instead of leaving retrieval pending", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })) as unknown as typeof fetch,
    );

    const resultPromise = retrieveSources(
      { rawInput: "La lutte contre les incendies est-elle suffisamment financée ?", inputType: "question" },
      {
        inputTerms: ["incendies"],
        providerDecisions: [{ provider: "wikipedia", query: "incendies", segmentIds: ["segment-1"], reason: "Background fire context.", triggeredBy: ["segment-1"], confidence: 0.8 }],
        skippedProviders: [],
        queryVariants: ["incendies"],
      },
    );
    await vi.advanceTimersByTimeAsync(8_000);
    const result = await resultPromise;

    expect(result.outcomes[0]).toMatchObject({ provider: "wikipedia", status: "upstream_failure", sourceCount: 0 });
    expect(result.outcomes[0]?.message).toMatch(/did not respond within 8 seconds/i);
  });

  it("builds the replacement provider query plan", () => {
    expect(
      buildQueries({
        rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
        inputType: "question",
      }).map((query) => query.provider),
    ).toEqual(["wikipedia", "rss", "reddit", "vie_publique", "data_gouv"]);
  });

  it("explains provider decisions before retrieval runs", () => {
    const plan = buildRetrievalPlan({
      rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
      inputType: "question",
    });

    expect(plan.inputTerms).toEqual(expect.arrayContaining(["construire", "nouvelles", "centrales"]));
    expect(plan.providerDecisions.find((decision) => decision.provider === "data_gouv")).toMatchObject({
      query: "construire nouvelles centrales nucleaires",
    });
    expect(plan.providerDecisions.every((decision) => decision.reason.length > 10)).toBe(true);
    expect(plan.queryVariants).toContain("construire nouvelles centrales nucleaires");
  });
});
