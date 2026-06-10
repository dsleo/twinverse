# TV Audience Evaluation Experiment

This experiment simulates daily TV audience market shares using LLM personas to predict viewing behavior based on daily schedules.

## Experiment Goal
To validate if LLM-driven persona simulations can accurately predict TV viewing shares (MAE < 8%) and audience rankings (Spearman ρ > 0.65) compared to actual ratings.

## How to Run

### Prerequisites
- Node.js installed
- `.env` configured with necessary API keys (OpenAI, etc.)

### 1. Demo Run (2 dates, 5-10 mins, ~$1-2)
Use this to validate pipeline health and persona responses.
```bash
npx tsx scripts/demo-tv-eval.ts
```

### 2. Full Batch Run (14 dates, 30-60 mins, ~$20-30)
Use this for full evaluation and metric generation.
```bash
npm run dev
# In a separate terminal:
curl -X POST http://localhost:3000/api/lab/batch-eval
```

## Results
Results are generated as JSON in: `data/tv-audience/results/`

## Metrics
- **MAE:** Average percentage point error (Goal: <8%).
- **Spearman ρ:** Rank correlation (Goal: >0.65).
- **Top-1 Hit Rate:** Success in identifying the #1 program (Goal: >40%).
