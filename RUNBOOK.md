# TV Audience Simulation — Runbook

This compact guide explains how to run and validate the TV audience prediction experiment.

## 🚀 How to Run

### 1. Quick Demo (Recommended)
Validates the pipeline on 2 sample dates (`2026-06-06` & `2026-06-07`).
- **Time**: ~5 mins
- **Cost**: ~$1-2
```bash
npx tsx scripts/demo-tv-eval.ts
```

### 2. Full Batch Run
Runs predictions on all 14 dates in the backtest dataset.
- **Time**: ~30-60 mins
- **Cost**: ~$20-30
```bash
npm run dev
# In a separate terminal:
curl -X POST http://localhost:3000/api/lab/batch-eval
```

## 📊 Results & Metrics

Results are saved as JSON in: `data/tv-audience/results/`

### Evaluation Criteria:
- **MAE**: Average deviation from actual shares (Goal: < 4%).
- **Spearman ρ**: Ranking correlation (Goal: > 0.65).
- **Top-1 Hit Rate**: Success in identifying the nightly winner.
- **Top-3 Hit Rate**: Success in identifying the three most popular programs.

## 🛠 Technical Overview

1.  **Panel**: Uses a fixed 50-persona panel representing French TV viewers (cached in `data/panels/`).
2.  **Logic**: 
    - **Reasoning-First**: Personas generate a `rationale` before scoring.
    - **Parallel segments**: 5 segments of 10 personas processed in parallel.
    - **Robustness**: Automatic renormalization and missing program fallbacks.

## 🔍 Troubleshooting

- **API Keys**: Ensure `OPENAI_API_KEY` is set in your `.env`.
- **Panel Reset**: To rebuild the 50 personas, delete `data/panels/france-tv-viewer.json`.
- **Timeouts**: If the full batch times out, run the demo first to cache the panel.
