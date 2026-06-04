# Retrieval Provider Issues

This document tracks the current state of the live retrieval providers used by the `/memory` flow, the issues confirmed during debugging, and the most practical fix paths.

## Scope

Relevant code:
- [src/lib/memoryInjection.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/lib/memoryInjection.ts)
- [vite.config.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/vite.config.ts)

Current provider list in code:
- `wikipedia`
- `rss`
- `gdelt`
- `reddit`
- `google_trends`

Current behavior in the app:
- each provider attempts a live fetch
- if the provider returns no usable result or the request fails, the pipeline inserts a fallback source
- the UI now shows a `Reason:` line for fallback cards

## GDELT

### Current code status

Implementation:
- proxied through `/proxy/gdelt` in [vite.config.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/vite.config.ts)
- fetched in `fetchGdeltSources()` in [src/lib/memoryInjection.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/lib/memoryInjection.ts)
- fallback produced by `resolveProviderSources()` when the request fails or returns no usable articles

### Confirmed issue

Observed upstream result:
- `HTTP 429 Too Many Requests`

Interpretation:
- this is a real upstream rate-limit
- this is not currently a parsing bug in our code
- the provider can be live in principle, but it is not reliable for repeated direct browser-driven calls

### Impact

User-facing effect:
- source card falls back to `Recent event context`
- the UI now reports that GDELT rejected the request

System-level effect:
- the retrieval pipeline remains functional
- the event-context slot is degraded to a synthetic placeholder when throttled

### Recommended fixes

Best direct fix:
1. Move GDELT access behind a server-side retrieval layer.
2. Add response caching keyed by normalized query and freshness window.
3. Add retry/backoff handling for `429`.

Good fallback improvements:
1. Cache the last successful GDELT result for similar prompts.
2. Lower request frequency by deduplicating prompt variants.
3. Use an alternate news source when GDELT rate-limits.

Alternative provider options:
1. General news search via Google News RSS.
2. News APIs with terms that permit production use.
3. A maintained event/news connector rather than direct public scraping.

## Reddit

### Current code status

Implementation:
- proxied through `/proxy/reddit-search` in [vite.config.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/vite.config.ts)
- fetched in `fetchRedditSources()` in [src/lib/memoryInjection.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/lib/memoryInjection.ts)
- uses `https://www.reddit.com/search.json`

### Confirmed issue

Observed upstream result:
- `HTTP 403`

Interpretation:
- Reddit is blocking or rejecting this request path
- this is not a relevance/matching issue
- the current public JSON endpoint is not dependable for this use case from this integration path

### Impact

User-facing effect:
- source card falls back to `Public discourse signal`
- the UI now reports that Reddit rejected the request

System-level effect:
- the “public discourse” slot is synthetic unless the upstream happens to allow the request

### Recommended fixes

Best direct fix:
1. Stop depending on the public `search.json` path for production behavior.
2. Move Reddit retrieval server-side and use an approach consistent with Reddit’s access policies.

Safer product options:
1. Remove Reddit from the default provider set until a compliant path exists.
2. Mark it as optional/experimental instead of core grounding.

Alternative provider options:
1. Public forums that expose RSS or open APIs.
2. Mastodon or other social sources with more stable public access.
3. News-commentary or discussion aggregators with less aggressive blocking.

## Google Trends

### Current code status

Implementation:
- proxied through `/proxy/google-trends-daily` in [vite.config.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/vite.config.ts)
- fetched in `fetchGoogleTrendsSources()` in [src/lib/memoryInjection.ts](/Users/leodreyfusschmidt/Desktop/Repos/tweenverse/src/lib/memoryInjection.ts)

### Confirmed issue

Observed upstream result:
- `HTTP 404`

Interpretation:
- this was an integration bug on our side
- we were calling a Trends endpoint/path combination that did not produce a valid result for this use case
- prior UI wording incorrectly framed this as “no close trend overlap”

### Impact

User-facing effect before fix:
- fallback reason could incorrectly imply that Trends had been queried successfully but found no overlap

Current status after fix:
- the code now reports request failure instead of pretending a semantic overlap check succeeded

### Recommended fixes

Best direct fix:
1. Replace the broken endpoint approach with a valid, supported source path.
2. Do not infer “no overlap” unless a valid Trends dataset was actually returned and scored.

Practical options:
1. Use the Google Trends “Trending now” export/RSS path if it can be accessed consistently.
2. Use the official Google Trends API if access is available.
3. Remove Google Trends from the default pipeline until the source path is reliable.

Important note:
- Google announced an official Trends API in 2025, but availability is limited and not assumed here.

## Persona Name Extraction (NVIDIA Nemotron France)

### Current code status

Implementation:
- Fetched in `loadPersonaSample()` in [src/server/memory/personaSample.ts](src/server/memory/personaSample.ts).
- Uses the `nvidia/Nemotron-Personas-France` dataset from Hugging Face.

### Confirmed issue

Observed dataset structure:
- The dataset lacks a dedicated `name` or `full_name` column.
- Columns like `commune`, `departement`, and `occupation` are present and mapped correctly.
- Defaulting to "Persona {index}" results in a generic UI experience.

### Impact

User-facing effect:
- Evaluation cards and carousels show "Persona 12" instead of a human name, reducing the simulation's perceived realism.

### Resolution

Current fix:
- Implemented a regex-based name extractor in `normalizePersonaRow`.
- Since the `persona` narrative field always starts with the character's name followed by a verb (e.g., "Epse Janiak allie...", "Lamine Diouf est..."), the system now captures the leading tokens as the `name`.
- Pattern used: `/^([^.,]+?)\s+(?:allie|est|habite|travaille|nourrit|entre|aime|partage|vit|pratique|occupe|pense|consacre|veut|souhaite|espère|cherche)/i`.

### Recommended future improvements

1. **Named Entity Recognition (NER):** Use a lightweight NLP library or LLM pre-processing to extract names more reliably if the narrative structure varies in future dataset versions.
2. **Supplemental Dataset:** Join with a synthetic French name generator if the narrative extraction fails.
3. **Upstream Schema check:** Periodically check if NVIDIA updates the dataset schema to include a structured name field.

---

## Recommended Product Position

Short term:
1. Keep `wikipedia` and general `rss` as the most dependable default grounding.
2. Treat `gdelt`, `reddit`, and `google_trends` as opportunistic providers.
3. Keep failure reasons visible in the UI.

Medium term:
1. Introduce a server-side retrieval service.
2. Add caching, retry, rate-limit handling, and per-provider observability.
3. Separate “provider unavailable” from “no relevant result”.

Long term:
1. Replace fragile browser-proxied public endpoints with compliant, durable integrations.
2. Add health monitoring per provider.
3. Define a provider quality policy:
   - `core`: reliable enough for default use
   - `experimental`: visible but not trusted by default
   - `disabled`: removed until a viable access path exists

## Current Recommendation

If this feature needs to be dependable beyond demo quality:
1. move retrieval off the browser
2. downgrade Reddit and Google Trends from core assumptions
3. treat GDELT as cache-backed and rate-limited, not directly real-time
