# TV Audience Batch Evaluation — Quick Start

## TL;DR

Run predictions on all 14 dates in the backtest dataset and get performance metrics.

### Quick Demo (recommended first)
```bash
npx tsx scripts/demo-tv-eval.ts
```
- ⏱️ Takes ~5-10 min
- 💰 Costs ~$1-2
- 🎯 Runs on 2 sample dates to verify everything works

### Full Batch Run
```bash
curl -X POST http://localhost:3000/api/lab/batch-eval
```
- ⏱️ Takes ~30-60 min
- 💰 Costs ~$20-30
- 🎯 Runs on all 14 dates (2026-05-25 to 2026-06-07)

## What It Does

1. **Loads fixed panel** — 50 personas representing French TV viewers (cached after first build)
2. **For each date:**
   - Parses TV schedule from CSV (14-17 programs per date)
   - Calls LLM 50 times (5 segments × 10 personas each)
   - Each persona outputs probability distribution over all programs
   - Aggregates into predicted market share %
   - Compares against actual ratings

3. **Outputs results to file** with:
   - Predicted share % for each program
   - Actual share % (from CSV)
   - Evaluation metrics: MAE, Spearman ρ, top-1 hit rate

## Expected Results

Results look like this:

```
2026-06-07:
  Top prediction: Chasse gardée (25.8%)
  Actual winner:  Chasse gardée (26.3%)
  
  MAE: 2.15%              ← prediction error (lower is better)
  Spearman ρ: 0.8912      ← rank correlation (higher is better)
  Top-1 hit: ✓            ← did we get the winner right?
```

## Files Generated

After running, you'll get:
- `data/tv-audience/results/demo-tv-results-YYYY-MM-DD.json` (demo)
- `data/tv-audience/results/tv-batch-results-YYYY-MM-DD.json` (full batch)

Each file contains:
- All 50 predictions per program per date
- Evaluation metrics (MAE, Spearman ρ, top-1)
- Summary statistics across all dates

## Current Implementation Status

✅ **Complete and tested:**
- CSV parser (strips leaky columns)
- LLM structured-output preference elicitation
- Deterministic aggregation (probability summing)
- Evaluation metrics (MAE, Spearman ρ, top-1)
- Fixed 50-persona panel (builds once, caches for reuse)
- Demo runner (2 dates)
- Full batch runner (14 dates)
- API endpoint for batch execution
- Results display UI at `/lab/tv`

## Cost Breakdown

| Component | Calls | Cost |
|-----------|-------|------|
| **Demo** (2 dates) | ~100 | $1-2 |
| **Full batch** (14 dates) | ~700 | $20-30 |
| Panel building (first run only) | ~5 | <$1 |

## Architecture

### Pipeline (per date)
1. Parse schedule from CSV
2. Load cached 50-persona panel
3. Batch personas into 5 segments
4. Call LLM 50 times (50 structured-output calls)
5. Aggregate probabilities → market share %
6. Evaluate against actual ratings

### Key Files
- `src/server/lab/batchTvEvaluation.ts` — batch runner
- `src/app/api/lab/batch-eval/route.ts` — HTTP endpoint
- `scripts/demo-tv-eval.ts` — demo runner
- `src/server/lab/tvAggregation.ts` — evaluation metrics

## Example: Running Demo

```bash
$ npx tsx scripts/demo-tv-eval.ts

╔════════════════════════════════════════════════════════════╗
║   TV AUDIENCE PREDICTION — DEMO (2 DATES)                 ║
╚════════════════════════════════════════════════════════════╝

🎯 Running demo on 2 dates: 2026-06-06, 2026-06-07
👥 Panel: 50 personas (cached and reused)
📞 API calls: ~100 (2 dates × 50 personas)
⏱️  Estimated time: 5-10 minutes

📦 Loading/building panel...
   ✓ Loaded cached panel (50 personas)

📊 Processing 2026-06-06...
   ✓ Loaded schedule (16 programs)
   ✓ Elicited preferences (50 personas)
   ✓ Aggregated predictions (16 programs)
   ✓ Evaluation: MAE=6.82%, ρ=0.7234, Top-1=✗

📊 Processing 2026-06-07...
   ✓ Loaded schedule (16 programs)
   ✓ Elicited preferences (50 personas)
   ✓ Aggregated predictions (16 programs)
   ✓ Evaluation: MAE=2.15%, ρ=0.8912, Top-1=✓

╔════════════════════════════════════════════════════════════╗
║   DEMO COMPLETE                                            ║
╚════════════════════════════════════════════════════════════╝

✓ Completed in 487s
✓ Results: demo-tv-results-2026-06-09.json
```

Then open the results file:
```bash
cat data/tv-audience/results/demo-tv-results-2026-06-09.json
```

## Next: Improve Accuracy

The **primary lever for improvement is segment definitions**. Currently using 5 generic segments. To improve:

1. **More segments** — Use 7-10 instead of 5
2. **Better segment descriptions** — Based on actual viewing behavior patterns
3. **Include context** — Soccer match nights, holidays, competing events
4. **Weight personas** — By historical accuracy or viewing behavior

See: `TV_AUDIENCE_BATCH_README.md` and `claude/plans/splendid-exploring-zephyr.md`
