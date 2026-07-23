# Decision Report Spec

## Goal

The Decision Report is the user-facing final output of a lab run. It should answer: what does this simulation suggest we should do next?

The previous final step exposed the raw aggregation report as long prose. That made the product feel verbose and hard to act on. The new report keeps the underlying aggregation data, but presents it as a concise decision layer.

## Product Shape

The report should be a compact final card with:

- Recommended read.
- Four key metrics.
- Top two audience splits.
- Watchouts.
- Segment read strip.
- Evidence and caveat line.

The report is not a polling result. It must keep the simulation caveat visible without burying the actual recommendation.

## UI Plan

The report appears in the lab result flow as `Decision report`, replacing the previous `Divergence report` prose section.

The hierarchy is:

1. `Recommended read`: one sentence recommendation derived from the balance of support, resistance, mixed reactions, and confidence.
2. Metrics: dominant read, support share, resistance share, average confidence.
3. Main splits: at most two divergences from the aggregation report.
4. Watchouts: misunderstanding risks from persona reactions, falling back to caveats.
5. Segment strip: each segment's dominant stance and top drivers.
6. Evidence/caveat footer: source coverage and two caveats.

## Code Plan

Implementation should avoid a new model call in the first version. The existing `aggregateReport`, `reactions`, `retrieval`, and `populationMap` already contain enough structure for a concise report.

Add:

- `src/components/lab/DecisionReport.tsx`
- `buildDecisionReportModel(run)`
- Decision-report CSS classes in `src/styles.css`

Update:

- `src/components/lab/LabPageClient.tsx` to render `DecisionReport`.
- Run summary cards to include a `Report` jump target.

Do not change persistence or schemas in this first implementation.

## Future API Shape

If the report later needs export, sharing, or persisted analyst edits, promote the derived model into a stored `decisionReport` field:

- `recommendation`
- `summary`
- `metrics`
- `divergences`
- `segmentReads`
- `risks`
- `sourceClaimIds`
- `caveats`
- `createdAt`
- `version`

## Acceptance Criteria

- The final result is shorter than the old divergence report.
- The recommendation is visible before any supporting detail.
- The report preserves evidence and simulation caveats.
- No existing lab run schema migration is required.
- TV audience results keep their existing specialized result component.

## Risks

- A derived recommendation can sound too decisive. Keep the `Synthetic simulation` badge and caveat footer visible.
- The first version has no editable analyst summary or export.
- Metrics are based only on evaluated personas, not a representative poll.
