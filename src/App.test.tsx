import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "./App";

function renderApp(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routes", () => {
  it("renders the homepage by default", () => {
    renderApp();
    expect(screen.getByRole("heading", { name: /build conviction before you field the study/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open the lab/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /choose one decision surface/i })).toBeInTheDocument();
    expect(screen.queryByText(/see the source brands/i)).not.toBeInTheDocument();
  });

  it("redirects the lab index route to the homepage chooser", () => {
    renderApp(["/lab"]);
    expect(screen.getByRole("heading", { name: /build conviction before you field the study/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /french opinion simulator/i })).toBeInTheDocument();
  });

  it("renders a demo route and resolves a simulation", async () => {
    renderApp(["/lab/opinion"]);
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /would you support a public policy that caps public-transport fare increases/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /survey reference: commission des sondages/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /french opinion simulator/i })).toBeInTheDocument();
    expect(
      await screen.findByText(/net support is positive because the policy reads as immediate cost protection/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/transport fare shield/i)).toBeInTheDocument();
    expect(screen.queryByText(/^readout$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^segment shift$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /read the method/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/local deterministic engine/i)).not.toBeInTheDocument();
  });

  it("switches demos from the homepage lab chooser", async () => {
    const user = userEvent.setup();
    renderApp(["/"]);

    await user.click(screen.getByRole("link", { name: /retail launch forecaster/i }));

    expect(
      await screen.findByRole("heading", { name: /how likely would you be to adopt a premium household subscription/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/adoption improves when the offer is legible as monthly savings/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("keeps the demo route to one focused frame", async () => {
    renderApp(["/lab/opinion"]);

    expect(
      await screen.findByText(/net support is positive because the policy reads as immediate cost protection/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /protection frame/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /budget discipline frame/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/framing changed/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
  });

  it("renames the b2b question label to the scenario title", () => {
    renderApp(["/lab/b2b"]);

    expect(screen.getByText(/ai back-office pilot/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /how likely is your buying committee to approve an ai-assisted/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stress-test a software purchase for sme back-office automation/i)).not.toBeInTheDocument();
  });

  it("keeps voices collapsed until a persona is selected", async () => {
    const user = userEvent.setup();
    renderApp(["/lab/opinion"]);

    expect(
      await screen.findByText(/net support is positive because the policy reads as immediate cost protection/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();

    expect(screen.queryByText(/single parent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2 evidence sources/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /mélissa courtin/i }));

    expect(screen.getByRole("button", { name: /mélissa courtin/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/time-poor and price-aware/i)).toBeInTheDocument();
    expect(screen.getByText(/single parent/i)).toBeInTheDocument();
    expect(screen.getByText(/33 years old/i)).toBeInTheDocument();
    expect(screen.getByText(/toulouse/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /mélissa courtin/i }));

    expect(screen.getByRole("button", { name: /mélissa courtin/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/single parent/i)).not.toBeInTheDocument();
  });

  it("renders evidence without extra summary note blocks", async () => {
    renderApp(["/lab/retail"]);

    expect(
      await screen.findByText(/adoption improves when the offer is legible as monthly savings/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /all sources/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /institution/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /check the sources/i })).toBeInTheDocument();
    expect(screen.getByText(/household consumer confidence remains sluggish/i)).toBeInTheDocument();
    expect(screen.queryByText(/^current signals$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^market pressure$/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /insee 2025-06-27/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /arcep \/ credoc 2025-03-19/i }).length).toBeGreaterThan(0);
  });

  it("renders the sources page with source brands", () => {
    renderApp(["/sources"]);
    expect(screen.getByRole("heading", { name: /source signals stay visible/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/source signals/i)).toBeInTheDocument();
  });

  it("renders the method route", () => {
    renderApp(["/method"]);
    expect(screen.getByRole("heading", { name: /how the readout stays grounded/i })).toBeInTheDocument();
    expect(screen.getByText(/inputs, personas, evidence/i)).toBeInTheDocument();
    expect(screen.queryByText(/source pack service \+ scenario compiler/i)).not.toBeInTheDocument();
  });

  it("renders the persona explorer route", () => {
    renderApp(["/personas"]);
    expect(screen.getByRole("heading", { name: /inspect the panel/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/search personas/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Epse Janiak/i).length).toBeGreaterThan(0);
  });

  it("updates persona detail after search filtering", async () => {
    const user = userEvent.setup();
    renderApp(["/personas"]);

    await user.type(screen.getByLabelText(/search personas/i), "finance");

    expect(screen.getAllByText(/Jean-Baptiste Rolland/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Epse Janiak/i)).not.toBeInTheDocument();
  });
});
