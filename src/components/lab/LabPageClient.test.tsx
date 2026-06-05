import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LabPageClient } from "./LabPageClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("LabPageClient", () => {
  it("keeps the manual Lab route free of the Figaro mode picker", () => {
    render(<LabPageClient fixedMode="manual" />);

    expect(screen.queryByText("Choose the prompt source")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste a question/i)).toBeInTheDocument();
    expect(screen.queryByText(/Le Figaro du jour/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Segments and panel selection reflect a general France-wide audience mix\./i)).not.toBeInTheDocument();
  });

  it("renders the Le Figaro mode as a read-only daily question flow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/lab/daily-question")) {
          return {
            ok: true,
            json: async () => ({
              status: "available",
              source: "le_figaro",
              question: "Faut-il interdire les écrans avant 11 ans ?",
              promptSource: {
                publisher: "Le Figaro",
                label: "Question du jour",
                url: "https://video.lefigaro.fr/figaro/la-question-du-jour",
                questionDate: "2026-06-05",
                fetchedAt: "2026-06-05T08:00:00.000Z",
                cacheStatus: "fresh",
              },
            }),
          } as Response;
        }
        throw new Error(`Unexpected request: ${url}`);
      }) as unknown as typeof fetch,
    );

    render(<LabPageClient fixedMode="le_figaro_daily" />);

    expect(await screen.findByText("Faut-il interdire les écrans avant 11 ans ?")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Paste a question/i)).not.toBeInTheDocument();
    expect(screen.getByText(/5 juin 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/Audience lens/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refresh question/i })).not.toBeInTheDocument();
  });

  it("disables the run action when the daily question is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/lab/daily-question")) {
          return {
            ok: false,
            json: async () => ({
              status: "unavailable",
              source: "le_figaro",
              message: "Le Figaro request failed with HTTP 503.",
            }),
          } as Response;
        }
        throw new Error(`Unexpected request: ${url}`);
      }) as unknown as typeof fetch,
    );

    render(<LabPageClient fixedMode="le_figaro_daily" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Run/i })).toBeDisabled();
    });
  });
});
