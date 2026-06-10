# Future Improvements & Roadmap

This document outlines proposed advanced methodologies to enhance the accuracy and performance of the TV audience simulation pipeline.

## 1. Advanced Methodologies (Accuracy)

### Few-Shot In-Context Learning
- **Goal:** Reduce hallucinations and ground the persona in realistic behavior.
- **Implementation:** Include 1–2 high-quality examples of actual or highly probable viewing behavior for the specific persona type within the prompt. 
- **Benefit:** Grounds the LLM in specific patterns based on past data, leading to more realistic scoring distributions.

### Temporal Context Simulation (Day-by-Day)
- **Goal:** Capture viewing habits that span multiple days.
- **Implementation:** Execute simulations sequentially (day-by-day). Feed the output of Day $N-1$ (what the persona watched) into the prompt for Day $N$ as context.
- **Benefit:** Allows modeling of multi-part series, show loyalty, or "viewing fatigue" which are currently ignored in single-day simulations.

## 2. Advanced Sampling (Accuracy & Diversity)

### Behavior-Weighted Sampling
- **Goal:** Improve population representativeness.
- **Implementation:** Implement a sampling scheme that, based on actual aggregate audience data from the previous day, adjusts the likelihood of a persona "watching TV" at all.
- **Benefit:** Better aligns simulation outputs with aggregate market realities while maintaining persona-level granularity.

## 3. Performance & Cost Optimization

### Persona Archetype Clusters
- **Goal:** Drastically reduce LLM call volume.
- **Implementation:** Cluster the 50-persona panel into 5-10 distinct "Archetypes." Run simulations for archetypes only, then map results back to individual personas based on their cluster membership.
- **Benefit:** Significant reduction in cost (~80%) and latency while maintaining output variance.
