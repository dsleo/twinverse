# Tweenverse

Tweenverse is a frontend demo for a grounded synthetic-personas product focused on France.

The current app is intentionally small and public-facing:
- a homepage
- a live lab
- a persona explorer
- a minimal source-brand surface

The UI now avoids roadmap pages and extra product chrome. The implementation details, architecture, and design rationale live here instead of in the public site.

## Product intent

The core idea is to show how synthetic users can be made more believable by combining:
- a stable persona panel
- current public information
- real survey or poll framing
- inspectable evidence-linked outputs

The three demo modes are:
- `French Opinion Simulator`
- `Retail Launch Forecaster`
- `B2B Buying Committee Simulator`

## What the app does today

The app currently runs on a deterministic local simulation provider. It does not call a live model yet.

Even so, the product loop is already represented end to end:
- source references are stored and validated
- scenarios are compiled into packets
- personas are selected and resolved
- persona-level outputs are returned with structured fields
- segment aggregates and evidence surfaces are rendered in the UI

The lab output contract is explicit:
- baseline preference
- effect of recent events
- final answer
- confidence
- evidence references

## Current route structure

- `/`
  Public homepage with the main proposition and a logo-only source carousel.
- `/lab`
  Main interactive simulation surface.
- `/personas`
  Search and drill-down interface for synthetic personas.
- `/sources`
  Minimal source-brand presentation.

Removed from the public UI:
- global header navigation
- global footer navigation
- method page
- landscape page

## Architecture

### App shell

- [src/App.tsx](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/App.tsx)
  Route registration.
- [src/components/layout/SiteLayout.tsx](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/components/layout/SiteLayout.tsx)
  Minimal shell with only the page container.

### Pages

- [src/pages/HomePage.tsx](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/pages/HomePage.tsx)
- [src/pages/LabPage.tsx](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/pages/LabPage.tsx)
- [src/pages/PersonasPage.tsx](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/pages/PersonasPage.tsx)
- [src/pages/SourcesPage.tsx](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/pages/SourcesPage.tsx)

### Domain layer

- [src/lib/contentRepository.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/lib/contentRepository.ts)
  Validated access to seeded sources, personas, questions, event briefs, and scenarios.
- [src/lib/sourcePack.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/lib/sourcePack.ts)
  Source-pack shaping and evidence grouping.
- [src/lib/scenarioCompiler.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/lib/scenarioCompiler.ts)
  Scenario compilation and aggregation logic.
- [src/lib/simulationService.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/lib/simulationService.ts)
  Provider boundary for current local simulation and future server-backed inference.
- [src/hooks/useSimulation.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/hooks/useSimulation.ts)
  Runtime orchestration for staged compute progress in the UI.

### Seed data

- [src/data/mockData.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/data/mockData.ts)
  Seeded personas, sources, event briefs, questions, scenarios, and demo facts.

### UI sections

The lab is composed from smaller sections rather than one monolithic page component:
- hero
- demo tabs
- headline band
- compute panel
- scenario controls
- results
- persona responses
- evidence
- pipeline

## Source-brand treatment

Source brands are intentionally reduced to marks only.

That treatment lives in:
- [src/components/branding/SourceBrandStrip.tsx](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/components/branding/SourceBrandStrip.tsx)
- [src/styles.css](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/styles.css)

At the moment those marks are generated from publisher initials rather than official SVG logos. That keeps the repo simple while preserving the UX intent.

If you later want real logos, replace the initials with an explicit brand asset map.

## Design direction

The original design direction was a provocative editorial prediction lab inspired by:
- [Kronaxis election results](https://kronaxis.co.uk/election-results)
- the Broadside visual style from [beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates#broadside)

The app has since been simplified:
- less chrome
- fewer routes
- less explanatory copy in the public UI
- stronger emphasis on the lab itself

## Landscape notes

The removed `Landscape` page existed only as internal framing.

The relevant product-positioning notes are:
- `Synthetic Users` is strong on the synthetic-research category surface but less oriented toward explicit public-information grounding.
- `Artificial Societies` signals simulation depth, but the public product surface is less immediately legible for evidence-linked scenario testing.
- Tweenverse should position around:
  - grounded current-information inputs
  - recognizable source provenance
  - inspectable persona outputs
  - scenario testing across opinion, retail, and B2B

Those points should guide messaging and future design, but they do not need to appear as a public comparison page.

## How to run

```bash
npm install
npm run dev
```

Tests:

```bash
npm test -- --run
```

Production build:

```bash
npm run build
```

Source manifest refresh:

```bash
npm run sync:sources
```

## What is still fake vs real

Real:
- route structure
- UI architecture
- source and persona schemas
- scenario compiler boundary
- evidence surface
- compute orchestration contract

Still demo data:
- seeded sources
- deterministic simulation outputs
- generated source-brand marks

## Next production step

The correct next step is not putting an OpenAI key in the browser.

The correct production move is:
1. Add a server-side `/api/simulate` endpoint.
2. Retrieve current source-pack data there.
3. Call OpenAI from the server.
4. Return the same `SimulationResult` shape already used by the frontend.

That preserves the current UI architecture while making the demo genuinely model-backed.

## Future work

The current personas are still seeded locally in `src/data/mockData.ts`.

If we want the persona panel to reflect the intended source of truth, the next data migration should pull persona records from the Hugging Face dataset:
[nvidia/Nemotron-Personas-France](https://huggingface.co/datasets/nvidia/Nemotron-Personas-France)

That would replace the hand-authored demo personas with dataset-backed records, while keeping the same validation and lookup layer in `src/lib/contentRepository.ts`.

## Source provenance

The source references and supporting facts are also local seed data for now.

- `src/data/mockData.ts` contains the source metadata shown in the UI, including titles, publishers, URLs, dates, summaries, and tags.
- `src/data/source-manifest.generated.json` is a generated URL manifest created by `scripts/sync-sources.mjs`.
- The current app does not fetch source content from a live API at runtime.
- The evidence panel and source-brand strip both read from the same validated local repository layer in `src/lib/contentRepository.ts`.

Future ingestion should replace the local source metadata with a live pipeline, but keep the same public-facing shapes so the UI does not need to change.
