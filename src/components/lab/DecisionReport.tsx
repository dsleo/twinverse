"use client";

import type { PersistedLabRun } from "../../lib/labSchemas";

type AggregateReport = NonNullable<PersistedLabRun["aggregateReport"]>;

type ReportMetric = {
  label: string;
  value: string;
  note: string;
};

export type DecisionReportModel = {
  recommendation: string;
  summary: string;
  evidenceLine: string;
  metrics: ReportMetric[];
  divergences: AggregateReport["mainDivergences"];
  segments: AggregateReport["perSegmentSummary"];
  risks: string[];
  caveats: string[];
};

type StanceBucket = "support" | "resist" | "mixed";

const stanceBucketLabels: Record<StanceBucket, string> = {
  support: "Support",
  resist: "Resistance",
  mixed: "Mixed",
};

function stanceBucket(stance: PersistedLabRun["reactions"][number]["stance"]): StanceBucket {
  if (stance === "support" || stance === "strong_support") {
    return "support";
  }
  if (stance === "oppose" || stance === "strong_oppose") {
    return "resist";
  }
  return "mixed";
}

function percent(count: number, total: number) {
  if (total === 0) {
    return "0%";
  }
  return `${Math.round((count / total) * 100)}%`;
}

function compactList(values: string[], maxItems: number) {
  return values.map((value) => value.trim()).filter(Boolean).slice(0, maxItems);
}

function topBucketLabel(counts: Record<StanceBucket, number>) {
  const entries = Object.entries(counts) as Array<[StanceBucket, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return stanceBucketLabels[entries[0][0]];
}

function recommendationFrom(counts: Record<StanceBucket, number>, total: number) {
  if (total === 0) {
    return "No decision signal yet";
  }

  const supportShare = counts.support / total;
  const resistanceShare = counts.resist / total;
  const mixedShare = counts.mixed / total;

  if (resistanceShare >= 0.45) {
    return "Do not ship the message unchanged";
  }
  if (mixedShare + resistanceShare >= 0.5) {
    return "Refine the framing before acting";
  }
  if (supportShare >= 0.55) {
    return "Promising, but validate the weak spots";
  }
  return "Treat the reaction as unresolved";
}

function summarizeSourceCoverage(run: PersistedLabRun) {
  const sources = run.retrieval?.sources ?? [];
  if (sources.length === 0) {
    return "No source stack attached to this run.";
  }

  const liveCount = sources.filter((source) => source.provenance === "live").length;
  const fallbackCount = sources.length - liveCount;
  if (fallbackCount === 0) {
    return `${liveCount} live sources grounded this report.`;
  }
  return `${liveCount} live sources and ${fallbackCount} fallback signals grounded this report.`;
}

export function buildDecisionReportModel(run: PersistedLabRun): DecisionReportModel | null {
  const report = run.aggregateReport;
  if (!report) {
    return null;
  }

  const counts: Record<StanceBucket, number> = { support: 0, resist: 0, mixed: 0 };
  for (const reaction of run.reactions) {
    counts[stanceBucket(reaction.stance)] += 1;
  }

  const total = run.reactions.length;
  const averageConfidence =
    total === 0 ? 0 : run.reactions.reduce((sum, reaction) => sum + reaction.confidence, 0) / total;
  const misunderstandingRisks = compactList(
    run.reactions.flatMap((reaction) => (reaction.misunderstanding ? [reaction.misunderstanding] : [])),
    3,
  );

  return {
    recommendation: recommendationFrom(counts, total),
    summary: report.overallPattern || report.executiveSummary,
    evidenceLine: summarizeSourceCoverage(run),
    metrics: [
      {
        label: "Dominant read",
        value: topBucketLabel(counts),
        note: `${total} evaluated voices`,
      },
      {
        label: "Support",
        value: percent(counts.support, total),
        note: `${counts.support} supportive reactions`,
      },
      {
        label: "Resistance",
        value: percent(counts.resist, total),
        note: `${counts.resist} opposing reactions`,
      },
      {
        label: "Confidence",
        value: averageConfidence ? averageConfidence.toFixed(1) : "n/a",
        note: "Mean persona confidence / 5",
      },
    ],
    divergences: report.mainDivergences.slice(0, 2),
    segments: report.perSegmentSummary,
    risks: misunderstandingRisks.length > 0 ? misunderstandingRisks : compactList(report.caveats, 2),
    caveats: compactList(report.caveats, 2),
  };
}

export function DecisionReport({ run }: { run: PersistedLabRun }) {
  const model = buildDecisionReportModel(run);
  if (!model) {
    return null;
  }

  return (
    <section id="lab-decision-report" className="lab-card decision-report">
      <div className="section-heading section-heading-compact">
        <div>
          <div className="section-label">Decision report</div>
          <h2>What to do with this run</h2>
        </div>
      </div>

      <div className="decision-report-hero">
        <div>
          <p className="decision-report-kicker">Recommended read</p>
          <h3>{model.recommendation}</h3>
          <p>{model.summary}</p>
        </div>
        <span className="status-pill status-complete">Synthetic simulation</span>
      </div>

      <div className="decision-metric-grid">
        {model.metrics.map((metric) => (
          <article key={metric.label} className="decision-metric">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.note}</p>
          </article>
        ))}
      </div>

      <div className="decision-report-grid">
        <article className="decision-report-block">
          <div className="section-label">Main splits</div>
          {model.divergences.map((item) => (
            <div key={item.title} className="decision-report-row">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          ))}
        </article>

        <article className="decision-report-block">
          <div className="section-label">Watchouts</div>
          <ul className="decision-list">
            {model.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </article>
      </div>

      <div className="decision-segment-strip" aria-label="Segment reads">
        {model.segments.map((segment) => (
          <article key={segment.segmentId} className="decision-segment">
            <span>{segment.label}</span>
            <strong>{segment.dominantStance}</strong>
            <p>{segment.keyDrivers.slice(0, 2).join(" / ")}</p>
          </article>
        ))}
      </div>

      <p className="lab-warning">
        {model.evidenceLine} {model.caveats.join(" ")}
      </p>
    </section>
  );
}
