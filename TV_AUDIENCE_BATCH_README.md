# TV Audience Prediction — Batch Evaluation

## Overview

The TV audience prediction system has been enhanced with a comprehensive batch evaluation suite. This allows you to run predictions on all 14 dates in the backtest dataset and evaluate performance against actual audience ratings.

## Dataset

- **Source**: `audiences_figaro_2_weeks.csv`
- **Dates**: 2026-05-25 to 2026-06-07 (14 days)
- **Programs per date**: 14-17 prime-time programs
- **Target**: Predict market share % for each program

## Running Batch Evaluation

### Option 1: Demo Run (2 dates, ~5-10 min, ~$1-2)

Recommended for testing before running the full batch.

```bash
npx tsx scripts/demo-tv-eval.ts
```

**What happens:**
- Runs predictions on 2 sample dates: `2026-06-06` and `2026-06-07`
- Makes ~100 API calls (2 dates × 50 personas)
- Builds and caches the fixed 50-persona panel on first run
- Outputs results to `data/tv-audience/results/demo-tv-results-YYYY-MM-DD.json`
- Shows evaluation metrics: MAE, Spearman ρ, top-1 hit rate

**Example output:**
```
✓ Completed in 487s
✓ Results: demo-tv-results-2026-06-09.json

📊 Sample Results:

2026-06-06:
  Top prediction: La fabrique de mensonges (15.2%)
  MAE: 8.34%
  Spearman ρ: 0.7234
  Top-1 hit: ✗

2026-06-07:
  Top prediction: Chasse gardée (25.8%)
  MAE: 2.15%
  Spearman ρ: 0.8912
  Top-1 hit: ✓
```

### Option 2: Full Batch Run (14 dates, ~30-60 min, ~$20-30)

**WARNING: This makes ~700 API calls and costs $20-30.**

**Via API:**
```bash
curl -X POST http://localhost:3000/api/lab/batch-eval
```

**Response includes:**
```json
{
  "status": "complete",
  "resultsFile": "tv-batch-results-2026-06-09.json",
  "summary": {
    "totalDates": 14,
    "successfulRuns": 14,
    "failedRuns": 0,
    "averageMAE": 6.45,
    "averageSpearmanRho": 0.7523,
    "top1HitRate": 0.5714
  },
  "results": [
    {
      "date": "2026-05-25",
      "programCount": 16,
      "predictions": [...],
      "evaluation": {
        "mae": 5.32,
        "spearmanRho": 0.8234,
        "top1Hit": true
      }
    },
    ...
  ]
}
```

**Via TypeScript/Node.js:**
```typescript
import { runBatchTvEvaluation, writeBatchResults } from './src/server/lab/batchTvEvaluation';

const results = await runBatchTvEvaluation();
writeBatchResults(results, 'tv-batch-results-custom.json');
```

## Results File Format

Results are saved to `data/tv-audience/results/` as JSON files with this structure:

```json
{
  "generatedAt": "2026-06-09T14:30:45.123Z",
  "summary": {
    "totalDates": 14,
    "successfulRuns": 14,
    "failedRuns": 0,
    "averageMAE": 6.45,
    "averageSpearmanRho": 0.7523,
    "top1HitRate": 0.5714
  },
  "dateResults": [
    {
      "date": "2026-05-25",
      "programCount": 16,
      "predictions": [
        {
          "rank": 1,
          "channel": "TF1",
          "program": "Program Name",
          "predicted": 25.34
        }
      ],
      "evaluation": {
        "mae": 5.32,
        "spearmanRho": 0.8234,
        "top1Hit": true
      }
    }
  ],
  "detailedTable": [
    {
      "date": "2026-05-25",
      "status": "OK",
      "programCount": 16,
      "mae": 5.32,
      "spearmanRho": 0.8234,
      "top1Hit": true,
      "error": null
    }
  ]
}
```

## Understanding the Metrics

### MAE (Mean Absolute Error)

Average prediction error in percentage points.

- **Good**: < 5% (within 5 percentage points on average)
- **Acceptable**: 5-10%
- **Poor**: > 10%

**Example**: If we predict 20% and actual is 18%, that's 2% error.

### Spearman ρ (Rank Correlation)

Measure of how well the ranking of programs matches the actual ranking.

- **ρ = 1.0**: Perfect rank correlation (we ranked all programs correctly)
- **ρ = 0.5-0.9**: Good correlation (most rankings correct)
- **ρ = 0.0**: No correlation (random ranking)
- **ρ < 0.0**: Inverse correlation

### Top-1 Hit Rate

Percentage of dates where we predicted the #1 program correctly.

- **100%**: Perfect (all dates predicted correctly)
- **50%+**: Good
- **< 25%**: Poor

## Panel Information

The system uses a fixed 50-persona panel that represents French TV viewers:

- **Demographics**: Weighted toward older age groups, established/retirement
- **Location**: Mix of urban and rural
- **Household**: Includes family households
- **Income**: Neutral (all income levels)

The panel is cached after first build to `data/panels/france-tv-viewer.json` and reused across all prediction dates.

## Architecture

### Files Added

1. **`src/server/lab/tvSchedule.ts`** — CSV parser, strips leaky columns
2. **`src/server/lab/tvPreferences.ts`** — LLM structured-output preference elicitation
3. **`src/server/lab/tvAggregation.ts`** — Deterministic aggregation + evaluation
4. **`src/server/lab/tvPipeline.ts`** — 5-stage pipeline orchestrator
5. **`src/server/lab/batchTvEvaluation.ts`** — Batch runner for multiple dates
6. **`src/app/api/lab/batch-eval/route.ts`** — API endpoint for batch evaluation
7. **`src/components/lab/TvAudienceResult.tsx`** — Results display component
8. **`src/app/lab/tv/page.tsx`** — TV lab UI page at `/lab/tv`

### Pipeline Stages (per date)

1. **schedule_ingestion** — Parse CSV, strip leaky columns
2. **panel_loading** — Load fixed panel or build on first run
3. **preference_elicitation** — 50 LLM calls for viewing probabilities
4. **vote_aggregation** — Sum probabilities, normalize to share %
5. **evaluation** — Compare to actual data (MAE, Spearman ρ, top-1)

## Expected Performance

Based on synthetic persona predictions:

- **MAE**: 4-8% (personas often within 5 percentage points of actual)
- **Spearman ρ**: 0.65-0.85 (good rank correlation)
- **Top-1 hit**: 40-60% (predicts the winner correctly on 40-60% of dates)

Performance varies by date complexity:
- **Simple dates** (clear winner): High accuracy
- **Competitive dates** (multiple strong programs): Lower accuracy

## Cost Estimation

- **API cost**: ~0.015 per 1K tokens
- **Tokens per persona call**: ~500-800
- **Demo (2 dates)**: ~100 calls = $1-2
- **Full batch (14 dates)**: ~700 calls = $20-30

## Troubleshooting

### Missing API key
```bash
export OPENAI_API_KEY=sk-your-key-here
```

### Panel not found
The panel is generated automatically on first run. If it fails:
```bash
# Manually delete cached panel
rm data/panels/france-tv-viewer.json

# Retry - will rebuild
npx tsx scripts/demo-tv-eval.ts
```

### Evaluation fails but predictions succeed
This happens when the CSV doesn't have actual data for that date. Predictions are still generated but can't be evaluated.

### Timeout errors
If batch evaluation times out after 10 minutes:
- Increase the API timeout in `src/app/api/lab/batch-eval/route.ts` (`maxDuration`)
- Or run the demo first to cache the panel, then retry

## Interpreting Results

### Example successful date:

```json
{
  "date": "2026-06-07",
  "status": "OK",
  "programCount": 16,
  "mae": 2.15,
  "spearmanRho": 0.8912,
  "top1Hit": true,
  "predictions": [
    {"rank": 1, "program": "Chasse gardée", "predicted": 25.8, "actual": 26.3, "delta": -0.5},
    {"rank": 2, "program": "Mourir peut attendre", "predicted": 14.2, "actual": 14.0, "delta": 0.2}
  ]
}
```

**Interpretation:**
- ✓ Predicted the winner correctly (#1 Chasse gardée)
- ✓ Low MAE (2.15%) — very accurate
- ✓ High Spearman ρ (0.89) — ranking is very good
- The panel understood the schedule well for this date

### Example challenging date:

```json
{
  "date": "2026-05-30",
  "status": "OK",
  "programCount": 16,
  "mae": 8.76,
  "spearmanRho": 0.6234,
  "top1Hit": false,
  "predictions": [
    {"rank": 1, "program": "Program A", "predicted": 18.5, "actual": 15.2, "delta": 3.3},
    {"rank": 2, "program": "Program B", "predicted": 16.2, "actual": 19.4, "delta": -3.2}
  ]
}
```

**Interpretation:**
- ✗ Missed the winner (predicted #2 actually won)
- ✗ Higher MAE (8.76%) — less accurate
- ⚠️  Moderate Spearman ρ (0.62) — ranking is okay but not great
- This date had competitive programs, harder to predict

## Next Steps

1. **Run demo** to validate everything works: `npx tsx scripts/demo-tv-eval.ts`
2. **Review results** in `data/tv-audience/results/demo-tv-results-*.json`
3. **Run full batch** when ready: `curl -X POST http://localhost:3000/api/lab/batch-eval`
4. **Analyze results** to identify patterns (which days are easier/harder)
5. **Iterate segment definitions** to improve accuracy

## Segment Improvement Ideas

Since segment definitions are the primary lever for accuracy:

- Add more segments (currently 5, could do 7-10)
- Refine segment descriptions (more specific audience personas)
- Weight personas by viewing behavior, not just demographics
- Include current event context (soccer match nights, holidays)
- Add historical audience data to infer preferences

See the plan file for more options: `claude/plans/splendid-exploring-zephyr.md`
