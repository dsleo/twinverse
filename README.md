# Tweenverse

Tweenverse is a frontend demo for a grounded synthetic-personas product focused on France.

The current app is intentionally small and public-facing:
- a homepage
- a server-backed memory pipeline

The UI now avoids extra product chrome. The implementation details, architecture, and design rationale live here instead of in the public site.

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

The homepage introduces the product, and the memory route drives the current server pipeline.

The memory pipeline is already represented end to end:
- the prompt is submitted from the browser
- the server persists each run
- population mapping and retrieval execute on the backend
- context packs, reactions, and divergence are returned in a structured payload
- the browser polls for run progress until completion

## Current route structure

- `/`
  Public homepage with the main proposition.
- `/memory`
  Server-backed memory injection workspace.

Historical pages are documented in [docs/legacy-pages.md](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/docs/legacy-pages.md).

## Architecture

### App shell

- [src/app/layout.tsx](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/app/layout.tsx)
  Shared document shell and metadata.
- [src/app/page.tsx](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/app/page.tsx)
  Public homepage.
- [src/app/memory/page.tsx](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/app/memory/page.tsx)
  Memory injection route.

### Memory pipeline

- [src/components/memory/MemoryPageClient.tsx](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/components/memory/MemoryPageClient.tsx)
  Browser shell for submitting runs and rendering the live response tree.
- [src/server/memory/pipeline.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/server/memory/pipeline.ts)
  Server entrypoint for each memory run.
- [src/server/memory/*](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/server/memory)
  Population mapping, retrieval, aggregation, reactions, and persistence.
- [src/app/api/memory/runs/route.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/app/api/memory/runs/route.ts)
  Start a run and list stored runs.
- [src/app/api/memory/runs/[runId]/route.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/app/api/memory/runs/[runId]/route.ts)
  Poll a single run by id.

### Seed data

- [src/data/mockData.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/data/mockData.ts)
  Seeded personas, sources, event briefs, questions, scenarios, and demo facts.

## Design direction

The original design direction was a provocative editorial prediction lab inspired by:
- [Kronaxis election results](https://kronaxis.co.uk/election-results)
- the Broadside visual style from [beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates#broadside)

The app has since been simplified:
- less chrome
- one public homepage
- one public memory route
- stronger emphasis on the memory pipeline

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

## Source provenance

The source references and supporting facts are also local seed data for now.

- `src/data/mockData.ts` contains the source metadata shown in the UI, including titles, publishers, URLs, dates, summaries, and tags.
- `src/data/source-manifest.generated.json` is a generated URL manifest created by `scripts/sync-sources.mjs`.
- The current app does not fetch source content from a live API at runtime.
- The memory pipeline reads from the same validated local repository layer in `src/lib/contentRepository.ts`.

Future ingestion should replace the local source metadata with a live pipeline, but keep the same public-facing shapes so the UI does not need to change.
