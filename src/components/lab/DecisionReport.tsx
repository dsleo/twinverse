"use client";

import type { PersistedLabRun } from "../../lib/labSchemas";

type AggregateReport = NonNullable<PersistedLabRun["aggregateReport"]>;

type ReportMetric = {
  label: string;
  value: string;
  note: string;
};

export type DecisionReportModel = {
  title: string;
  lead: string;
  detail: string[];
  metrics: ReportMetric[];
  divergences: AggregateReport["mainDivergences"];
  segments: AggregateReport["perSegmentSummary"];
};

type StanceBucket = "support" | "resist" | "mixed";

const stanceBucketLabels: Record<StanceBucket, string> = {
  support: "Support",
  resist: "Resistance",
  mixed: "Mixed",
};

function stanceBucket(
  stance: PersistedLabRun["reactions"][number]["stance"],
): StanceBucket {
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

function topBucketLabel(counts: Record<StanceBucket, number>) {
  const entries = Object.entries(counts) as Array<[StanceBucket, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return stanceBucketLabels[entries[0][0]];
}

function reportTitle(audience: PersistedLabRun["audiencePreset"]) {
  switch (audience) {
    case "le_figaro_reader":
      return "What Le Figaro readers take from this question";
    case "france_tv_viewer":
      return "What French TV viewers take from this question";
    default:
      return "What the France-wide panel takes from this question";
  }
}

function summarySentences(value: string) {
  const sentences =
    value
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? [];
  return sentences.length ? sentences : [value];
}

export function buildDecisionReportModel(
  run: PersistedLabRun,
): DecisionReportModel | null {
  const report = run.aggregateReport;
  if (!report) {
    return null;
  }

  const counts: Record<StanceBucket, number> = {
    support: 0,
    resist: 0,
    mixed: 0,
  };
  for (const reaction of run.reactions) {
    counts[stanceBucket(reaction.stance)] += 1;
  }

  const total = run.reactions.length;
  const averageConfidence =
    total === 0
      ? 0
      : run.reactions.reduce((sum, reaction) => sum + reaction.confidence, 0) /
        total;
  const summary = summarySentences(
    report.overallPattern || report.executiveSummary,
  );
  return {
    title: reportTitle(run.audiencePreset),
    lead: summary[0],
    detail: summary.slice(1),
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
        <div className="section-label">Audience readout</div>
      </div>

      <div className="decision-report-hero">
        <div>
          <h3>{model.title}</h3>
          <p className="decision-report-lead">{model.lead}</p>
          {model.detail.length ? (
            <details className="decision-summary-more">
              <summary>Read the full synthesis</summary>
              {model.detail.map((paragraph, index) => (
                <p key={`${index}-${paragraph}`}>{paragraph}</p>
              ))}
            </details>
          ) : null}
        </div>
        <div className="decision-metric-grid" aria-label="At a glance">
          {model.metrics.map((metric) => (
            <article key={metric.label} className="decision-metric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.note}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="decision-report-grid decision-report-grid-single">
        <article className="decision-report-block">
          <div className="section-label">What divides the audience</div>
          {model.divergences.map((item) => (
            <div key={item.title} className="decision-report-row">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          ))}
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
    </section>
  );
}
