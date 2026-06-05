import { afterEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { extractLeFigaroQuestionFromDossier, extractLeFigaroQuestionPage, resolveLeFigaroDailyQuestion } from "./dailyQuestion";
import { resetLabStorageForTests } from "./storage";

const originalFetch = globalThis.fetch;
const dataDir = path.join(process.cwd(), ".tmp-tests", "daily-question");

afterEach(async () => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  process.env.LAB_DATA_ROOT = dataDir;
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.LAB_DATA_ROOT;
  resetLabStorageForTests();
});

function htmlResponse(html: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
  } as Response;
}

describe("extractLeFigaroQuestionPage", () => {
  it("extracts a canonical question from metadata-first HTML", () => {
    const parsed = extractLeFigaroQuestionPage(`
      <html>
        <head>
          <meta property="og:title" content="La question du jour : Faut-il interdire les écrans avant 11 ans ?" />
          <meta name="twitter:title" content="La question du jour : Faut-il interdire les écrans avant 11 ans ?" />
          <script type="application/ld+json">
            {"headline":"La question du jour : Faut-il interdire les écrans avant 11 ans ?"}
          </script>
        </head>
        <body>
          <section>La question du jour Faut-il interdire les écrans avant 11 ans ? Votez et réagissez.</section>
        </body>
      </html>
    `);

    expect(parsed?.question).toBe("Faut-il interdire les écrans avant 11 ans ?");
    expect(parsed?.headline).toContain("Faut-il interdire");
  });
});

describe("extractLeFigaroQuestionFromDossier", () => {
  it("extracts the top question link from the dossier page", () => {
    const parsed = extractLeFigaroQuestionFromDossier(`
      <html>
        <body>
          <a href="/politique/etes-vous-favorable-au-gel-des-pensions-de-retraites-20250716">
            Êtes-vous favorable au gel des pensions de retraites ?
          </a>
          <a href="/politique/faut-il-baisser-la-tva-20250715">
            Faut-il baisser la TVA sur l'énergie ?
          </a>
        </body>
      </html>
    `);

    expect(parsed).toEqual({
      question: "Êtes-vous favorable au gel des pensions de retraites ?",
      url: "https://www.lefigaro.fr/politique/etes-vous-favorable-au-gel-des-pensions-de-retraites-20250716",
    });
  });
});

describe("resolveLeFigaroDailyQuestion", () => {
  it("uses the same-day cache after the first successful fetch", async () => {
    process.env.LAB_DATA_ROOT = dataDir;
    const fetchMock = vi.fn(async () =>
      htmlResponse(`
        <a href="/politique/faut-il-reduire-les-vacances-d-ete-20260605">
          Faut-il réduire les vacances d'été ?
        </a>
      `),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const now = new Date("2026-06-05T08:00:00.000Z");
    const first = await resolveLeFigaroDailyQuestion({ now });
    const second = await resolveLeFigaroDailyQuestion({ now });

    expect(first.status).toBe("available");
    expect(second.status).toBe("available");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (second.status === "available") {
      expect(second.promptSource.cacheStatus).toBe("cached");
    }
  });

  it("rolls over by Paris date and fetches a new question on the next day", async () => {
    process.env.LAB_DATA_ROOT = dataDir;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        htmlResponse(`<a href="/politique/faut-il-taxer-les-suv-en-ville-20260605">Faut-il taxer les SUV en ville ?</a>`),
      )
      .mockResolvedValueOnce(
        htmlResponse(`<a href="/politique/faut-il-limiter-les-locations-touristiques-20260606">Faut-il limiter les locations touristiques ?</a>`),
      );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const dayOne = await resolveLeFigaroDailyQuestion({ now: new Date("2026-06-05T08:00:00.000Z") });
    const dayTwo = await resolveLeFigaroDailyQuestion({ now: new Date("2026-06-06T08:00:00.000Z") });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(dayOne.status).toBe("available");
    expect(dayTwo.status).toBe("available");
    if (dayOne.status === "available" && dayTwo.status === "available") {
      expect(dayOne.question).not.toBe(dayTwo.question);
    }
  });

  it("returns unavailable when the live fetch fails before any same-day cache exists", async () => {
    process.env.LAB_DATA_ROOT = dataDir;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    );

    const result = await resolveLeFigaroDailyQuestion({ now: new Date("2026-06-05T08:00:00.000Z") });

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.message).toContain("network down");
    }
  });
});
