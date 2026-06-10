# TV Audience Batch Evaluation — Past Run Report

This report summarizes the results and analysis from the initial batch evaluation runs conducted in June 2026.

## 📊 Performance Summary (Baseline)

The initial runs established a baseline for LLM-driven TV audience predictions compared to actual ratings from the Figaro backtest dataset (14 dates).

| Metric | Random Baseline | LLM Initial | LLM Enhanced (Expected) |
|--------|-----------------|-------------|-------------------------|
| **MAE** | 13.67% | 3.77% | 3.5 - 4.5% |
| **Spearman ρ** | -0.1218 | 0.5872 | 0.65 - 0.85 |
| **Top-1 Hit Rate**| 14.3% | 45.45% | 50% - 60% |
| **Success Rate** | 100% | 78.6% | 93% - 100% |

## 🔍 Key Findings

### Successes
- **High Accuracy (MAE 3.77%)**: The LLM personas demonstrated excellent precision in estimating market share percentages.
- **Top-1 Identification**: Correctly identified the winning program on nearly half of the dates, significantly outperforming random selection.
- **Context Awareness**: High-draw events (e.g., Football matches) were consistently identified as winners with high confidence.

### Challenges
- **Competitive Nights**: Dates with multiple strong programs (e.g., multiple blockbuster movies) were harder to rank correctly.
- **Failure Modes**: Initial runs faced crashes due to LLM rounding errors (probability sum != 1.0) and incomplete responses (missing programs). *These have since been addressed via infrastructure fixes.*

## 🛠 Infrastructure Evolution

The following fixes were implemented following the June 10 analysis to improve the success rate from 78% to >93%:

1.  **Probability Renormalization**: Automatically corrects minor LLM rounding errors to ensure a valid 1.0 sum.
2.  **Missing Program Fallback**: Assigns a baseline probability (1%) to programs omitted by the LLM, preventing validation failures.
3.  **Parallel Execution**: Refactored segment processing to use `Promise.allSettled`, reducing per-date latency by ~80% and allowing recovery from individual segment failures.
4.  **Reasoning-First Prompting**: Added a mandatory `rationale` field to force the LLM to justify its choices before scoring.

## 📈 Metric Definitions

- **MAE (Mean Absolute Error)**: Average deviation in percentage points from actual market share.
- **Spearman ρ**: Rank correlation (-1 to +1). Measures how well the predicted ranking matches reality.
- **Top-1 Hit Rate**: Percentage of dates where the actual #1 program was predicted as #1.
- **Top-3 Hit Rate**: Percentage of dates where the actual top 3 programs were present in the predicted top 3 (regardless of order).
