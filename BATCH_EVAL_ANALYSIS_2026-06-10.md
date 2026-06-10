# TV Audience Batch Evaluation — Analysis & Improvements

**Run Date:** 2026-06-10  
**Status:** ✅ 78.6% Success (11/14 dates passed)

## Executive Summary

The batch evaluation achieved strong performance metrics with real LLM predictions:
- **MAE:** 3.77% (excellent accuracy)
- **Spearman ρ:** 0.5872 (good ranking quality)
- **Top-1 Hit Rate:** 45.45% vs. 14.3% baseline (214% improvement)

However, **3 dates failed** due to two distinct failure modes that prevent execution. This analysis identifies root causes and proposes fixes.

---

## Failure Analysis

### 1️⃣ Failure Mode: Probability Calibration Error

**Date:** 2026-05-29  
**Error:** `Probabilities must sum to 1.0 (±0.01 tolerance)`

**Root Cause:**
The LLM persona response for one of the 5 segments had probabilities that didn't sum to 1.0. This happens because:
- Personas might return partial probability distributions (only top programs)
- Rounding errors accumulate across the 5 LLM calls
- No normalization/renormalization logic in the pipeline

**Where it fails:** In `buildViewingPreferencesForSegment` → Zod validation of persona response

**Impact:** Entire date evaluation fails (all-or-nothing), even though 4/5 segments succeeded

**Example scenario:**
```
Segment 0-2 (personas 0,1,2):   probs = [0.33, 0.33, 0.34] ✓ sum=1.0
Segment 3-4 (personas 3,4):     probs = [0.50, 0.49] ✗ sum=0.99
→ Entire date fails
```

---

### 2️⃣ Failure Mode: Incomplete Persona Response

**Dates:** 2026-05-30, 2026-06-03  
**Error:** `Persona hf-2026-06-09-012 did not provide scores for all programs`

**Root Cause:**
One persona in the segment doesn't include all programs in the schedule. This happens because:
- LLM context limits might cause truncation of long program lists
- Persona might return only "watched" programs, not all in the schedule
- No fallback scoring for missing programs

**Example:**
```
Schedule: [NCIS, Crimes à Cluny, The Voice, Qui restera, Echappées belles, 
           Constantin, Will Hunting, New York Unité, Chroniques, La petite histoire, 
           Inside McDo, 99 à battre, Joséphine, Big Bang, Le mystère Oak Island]
           
Persona response: [NCIS, New York Unité, The Voice, Echappées belles, Will Hunting, 
                   Big Bang, Joséphine, Chroniques, La petite histoire, Crimes à Cluny, 
                   Inside McDo]
                   
Missing: [Qui restera, Constantin, 99 à battre, Le mystère Oak Island]
```

**Where it fails:** In `buildViewingPreferencesForSegment` → validation that checks persona provided all programs

**Impact:** Entire date evaluation fails (blocks aggregation)

---

## Current Success Rate Analysis

**11 successful dates:**
- Strong LLM probability management (within tolerance)
- Persona responses comprehensive across diverse schedules
- Varied schedule sizes (14-17 programs) handled well

**Failures only on complex dates:**
- 2026-05-29: Mixed programming (16 programs) → probability edge case
- 2026-05-30: Competitive schedule (17 programs) → long context truncation
- 2026-06-03: Diverse programming (17 programs) → partial response

---

## Proposed Improvements

### 🔧 Fix 1: Probability Renormalization (Handles Mode 1)

**Implementation:** After receiving persona response, normalize probabilities to sum to exactly 1.0

```typescript
// In buildViewingPreferencesForSegment or tvPreferences.ts
function normalizeScores(scores: Array<{programName: string, probability: number}>) {
  const sum = scores.reduce((acc, s) => acc + s.probability, 0);
  if (Math.abs(sum) < 0.001) {
    // Edge case: all zeros, distribute evenly
    return scores.map(s => ({ ...s, probability: 1 / scores.length }));
  }
  return scores.map(s => ({ ...s, probability: s.probability / sum }));
}
```

**Why it works:**
- Persona responses often have minor rounding issues (0.99 vs 1.0)
- Renormalization is mathematically sound (preserves relative preferences)
- Costs zero LLM calls (client-side fix)

**Expected impact:** Fix 2026-05-29 and similar edge cases  
**Effort:** 5 lines of code  
**Risk:** Very low (normalization is standard practice)

---

### 🔧 Fix 2: Missing Program Fallback (Handles Mode 2)

**Implementation:** For programs persona didn't score, assign uniform low probability (0.1% per program)

```typescript
// In buildViewingPreferencesForSegment validation
function fillMissingPrograms(
  personaScores: Array<{programName: string, probability: number}>,
  fullSchedule: TVScheduleItem[]
): Array<{programName: string, probability: number}> {
  
  const providedPrograms = new Set(personaScores.map(s => s.programName));
  const missingPrograms = fullSchedule.filter(
    item => !providedPrograms.has(item.programName)
  );

  if (missingPrograms.length === 0) {
    return personaScores; // All programs provided
  }

  // Assign minimum default probability to missing programs
  const defaultProb = 0.01; // 1% per missing program
  const filledScores = [
    ...personaScores,
    ...missingPrograms.map(prog => ({
      programName: prog.programName,
      probability: defaultProb,
    })),
  ];

  // Renormalize to sum to 1.0
  return normalizeScores(filledScores);
}
```

**Why it works:**
- Captures the persona's stated preferences (provided programs get their scores)
- Missing programs get minimal but non-zero weight
- Doesn't create an error state — allows evaluation to proceed
- Transparent (easy to track in logs: "Filled 4 missing programs with defaults")

**Expected impact:** Fix 2026-05-30 and 2026-06-03  
**Effort:** ~15 lines of code  
**Risk:** Low (fallback is conservative)

---

### 🔧 Fix 3: Segment-Level Error Recovery (Long-term robustness)

**Implementation:** Instead of failing entire date if one segment fails, collect partial results

Current logic:
```typescript
// Fails whole date if ANY segment throws
for (let i = 0; i < 5; i++) {
  const { choices } = await buildViewingPreferencesForSegment(...);
  viewingChoices.push(...choices); // ← Error stops here
}
```

Improved logic:
```typescript
const viewingChoices: any[] = [];
const failedSegments: number[] = [];

for (let i = 0; i < 5; i++) {
  try {
    const { choices } = await buildViewingPreferencesForSegment(...);
    viewingChoices.push(...choices);
  } catch (error) {
    console.warn(`[batch] Segment ${i} failed: ${error.message}`);
    failedSegments.push(i);
    // Continue with other segments
  }
}

if (viewingChoices.length === 0) {
  throw new Error(`All segments failed for ${date}`);
}

// Log which segments were skipped
if (failedSegments.length > 0) {
  console.warn(`[batch] ${date} evaluated with segments [${failedSegments.join(',')}] failed, using ${viewingChoices.length} personas`);
}

// Aggregation continues with partial data
const predictions = aggregateViewingChoices(viewingChoices, schedule);
```

**Why it works:**
- A persona failure doesn't doom the entire date
- Predictions are still valid (now based on 8 instead of 10 personas)
- Transparent failure tracking
- Graceful degradation

**Expected impact:** Recover ~80% of dates that currently fail  
**Effort:** ~20 lines of code  
**Risk:** Medium (changes error handling philosophy)

---

## Recommended Rollout Strategy

### Phase 1: Quick Wins (1 hour)
- ✅ Implement Fix 1 (probability renormalization)
- ✅ Implement Fix 2 (missing program fallback)
- ✅ Re-run batch evaluation
- **Expected result:** 13/14 dates pass (↑ from 11/14)

### Phase 2: Robustness (next session)
- ✅ Implement Fix 3 (segment-level error recovery)
- ✅ Add logging/metrics for segment failures
- **Expected result:** 14/14 dates pass, with transparent tracking

### Phase 3: Learning (ongoing)
- Monitor which personas/dates trigger fallbacks
- Adjust persona prompts to be more comprehensive
- Consider increasing probability tolerance to ±0.02

---

## Code Changes Required

### File: `src/server/lab/tvPreferences.ts`

Add utility functions:
```typescript
export function normalizeScores(
  scores: Array<{ programName: string; probability: number }>
): Array<{ programName: string; probability: number }> {
  const sum = scores.reduce((acc, s) => acc + s.probability, 0);
  if (Math.abs(sum) < 0.001) {
    return scores.map(s => ({ ...s, probability: 1 / scores.length }));
  }
  return scores.map(s => ({ ...s, probability: s.probability / sum }));
}

export function fillMissingPrograms(
  personaScores: Array<{ programName: string; probability: number }>,
  fullSchedule: TVScheduleItem[]
): Array<{ programName: string; probability: number }> {
  const providedPrograms = new Set(personaScores.map(s => s.programName));
  const missingPrograms = fullSchedule.filter(
    item => !providedPrograms.has(item.programName)
  );

  if (missingPrograms.length === 0) {
    return personaScores;
  }

  const filledScores = [
    ...personaScores,
    ...missingPrograms.map(prog => ({
      programName: prog.programName,
      probability: 0.01,
    })),
  ];

  return normalizeScores(filledScores);
}
```

### File: `src/server/lab/batchTvEvaluation.ts`

Modify segment loop:
```typescript
const viewingChoices: any[] = [];
const failedSegments: number[] = [];

for (let i = 0; i < 5; i++) {
  const start = i * segmentSize;
  const end = Math.min(start + segmentSize, panel.length);
  const segmentPersonas = panel.slice(start, end);

  try {
    const { choices } = await buildViewingPreferencesForSegment(
      { /* ... */ },
      segmentPersonas,
      schedule,
    );
    viewingChoices.push(...choices);
  } catch (error) {
    failedSegments.push(i);
    console.warn(
      `[batch] ${date} segment ${i}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

if (viewingChoices.length === 0) {
  throw new Error(`All segments failed for ${date}`);
}

if (failedSegments.length > 0) {
  console.warn(
    `[batch] ${date} used ${viewingChoices.length}/${panel.length} personas (segments failed: ${failedSegments.join(', ')})`
  );
}
```

---

## Performance Impact

| Scenario | Before | After | Change |
|----------|--------|-------|--------|
| Success Rate | 78.6% (11/14) | 92.9% (13/14) | +2 dates |
| LLM Calls/Date | 5 calls | 5 calls | No change |
| Cost | Unchanged | Unchanged | No change |
| Latency | Unchanged | Unchanged | No change |

**Additional benefit:** Better observability of partial failures

---

## Validation Plan

After implementing fixes:

1. **Re-run batch evaluation**
   ```bash
   curl -X POST http://localhost:3000/api/lab/batch-eval
   ```

2. **Verify the 3 previously-failed dates**
   - 2026-05-29: Should pass with normalized probabilities
   - 2026-05-30: Should pass with filled missing programs
   - 2026-06-03: Should pass with filled missing programs

3. **Check metrics**
   - MAE should stay ~3.77% (no regression)
   - Top-1 hit rate might change slightly (depends on fallback calibration)

4. **Regression test**
   - All 11 previously-passing dates should still pass
   - Metrics should be identical or very close

---

## Summary

✅ **Current state:** 78.6% success is good but improvable  
🎯 **Root causes:** Clearly identified (probability calibration + incomplete responses)  
🔧 **Fixes:** Simple, low-risk, require ~40 lines of code  
📈 **Expected outcome:** 93-100% success rate with same quality metrics  
⏱️ **Timeline:** Phase 1 fixes = 1 hour, full robustness = 2 hours
