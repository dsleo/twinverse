# TV Audience Simulation — Future Improvements

This roadmap outlines the unimplemented advanced methodologies planned to further enhance the accuracy and granularity of the simulation.

## 1. 🧠 Behavioral Modeling (Accuracy)

### Sequential Temporal Simulation
- **Concept**: Capture viewing habits that span multiple days.
- **Implementation**: Run simulations day-by-day. Feed the previous day's choice into the current day's prompt (e.g., "Yesterday you watched Part 1 of this series...").
- **Goal**: Model show loyalty, "cliffhanger" effects, and viewing fatigue.

### Few-Shot In-Context Learning
- **Concept**: Provide the LLM with concrete examples of "Gold Standard" behavior.
- **Implementation**: Include 1–2 examples of how a specific persona archetype typically responds to different schedule types (Sports night vs. Movie night).
- **Goal**: Ground the model in realistic French viewing patterns and reduce "average viewer" bias.

## 2. 🎲 Advanced Sampling Schemes

### Audience Participation Sampling
- **Concept**: Not every persona watches TV every night.
- **Implementation**: Use actual aggregate audience volume from the day before to weight a "toss" that determines if a persona is active in tonight's simulation.
- **Goal**: Align the total "simulated volume" with market reality.

### Cluster-Weighted Aggregation
- **Concept**: Use persona archetypes more effectively during results aggregation.
- **Implementation**: Weight the individual persona votes based on the real-world demographic prevalence of their assigned cluster (e.g., if "Retired" represents 30% of viewers, their votes should carry that weight).
- **Goal**: Correct for panel sample bias.

## 3. ⚡ Optimization & Scaling

### Persona Archetype Clusters (Cost)
- **Concept**: Drastically reduce LLM call volume by simulating clusters instead of individuals.
- **Implementation**: Run the "Reasoning-First" prompt once per archetype (e.g., 5-10 clusters) instead of once per 50 personas.
- **Goal**: 80% reduction in API costs and latency.

### Tiered Model Routing
- **Concept**: Use different models for different tasks.
- **Implementation**: Use a high-reasoning model (e.g., GPT-4o) for the `rationale` generation and a faster, cheaper model (e.g., GPT-4o-mini) for the final probability scoring.
- **Goal**: Cost optimization without accuracy loss.
