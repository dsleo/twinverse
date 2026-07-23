# Source Gathering Spec

## Purpose

Source gathering gives each simulated audience segment a bounded, plausible information environment. It does not claim that every person consumed every source.

## Pipeline

1. The Population Mapper defines five segment descriptions.
2. The Research Planner receives the original user question and those descriptions. It chooses a small set of provider/query tasks, marks the segments each task may inform, and writes queries in the question's language.
3. The retrieval layer validates the plan, runs each task once, applies an eight-second provider timeout, and records every provider outcome.
4. Live items are routed only to the segments named by their planned task, then capped at three items per segment.
5. Context packs receive only their segment's routed source titles and bounded snippets. They store the exact source IDs supplied.
6. Persona reactions receive that same segment-specific source set.

## Providers and Limits

- Wikipedia: one stable background item.
- Google News RSS: up to four current items per query.
- Reddit: up to four public-discourse posts per query.
- Vie publique: up to three items from its current feed, but an item must contain a distinctive query topic term.
- data.gouv.fr: up to three matching datasets.

The planner may return up to six tasks total and no more than two RSS tasks. It reuses a provider/query task across relevant segments rather than retrieving it again.

## Evidence Trace

The default trace shows only retained providers. Opening a provider reveals its retrieved items, each publisher link, snippet, and the segments that actually received it through a context pack.

The UI does not show provider failures, raw queries, score percentages, claim-type pills, or generic source limitations. Provider outcomes and planner/retrieval logs remain persisted for operational debugging.

## Reliability Rules

- Provider failures and timeouts are provider outcomes, not synthetic fallback sources.
- Context-pack and reaction batches must return exactly one output for every requested segment or persona ID. Duplicate output IDs trigger one repair attempt before the run fails.
- A source with no live result is not silently replaced.
- Full article bodies are not placed in context packs; current packs use bounded provider extracts. Article extraction and summarisation are a later feature.
