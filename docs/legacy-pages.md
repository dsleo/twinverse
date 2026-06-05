# Legacy Pages

This file documents the pages that existed before the Next.js migration. They are no longer part of the live app.

## Homepage

- Original landing page for the product demo.
- Combined the brand intro, source strip, explainer copy, and shortcuts into the lab and persona explorer.
- Also exposed a direct link to the standalone memory injection page.

## Lab Index

- Route selection page for the old lab shell.
- Introduced the three demo modes and pointed into the opinion, retail, and B2B flows.
- Served as the entry screen for the old `/lab/...` experience.

## Lab Page

- Main interactive simulation page for the old demo stack.
- Rendered the question, readout, persona responses, and evidence for the selected demo mode.
- Redirected to the opinion route when no demo slug was present.

## Personas Page

- Search and drill-down view for the synthetic persona roster.
- Let users inspect persona attributes, concerns, and regions outside the main simulation flow.

## Sources Page

- Minimal presentation page for source branding and provenance.
- Showed the source-brand strip without the rest of the simulation UI.

## Method Page

- Explanatory page for the old route family.
- Described the common pipeline and linked users back to the opinion demo.

## Not Found Page

- Fallback page for missing routes in the old router setup.
- Offered a single path back to the homepage.

## Memory Injection Page

- Original standalone memory demo before the server-backed rewrite.
- Collected a prompt locally, ran the synthetic pipeline in the browser, and rendered population mapping, retrieval planning, context packs, reactions, divergence, and run history.
- Has since been replaced by the current `/memory` route and server API flow.
