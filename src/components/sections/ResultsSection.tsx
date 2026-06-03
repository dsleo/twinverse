import { Activity, ArrowRight } from "lucide-react";
import { ComputePanel } from "../compute/ComputePanel";
import { siteCopy } from "../../config/siteCopy";
import type { ScenarioPacket, SegmentAggregation } from "../../types";

export function SurveyQuestionSection({
  packet,
  label,
  status,
  progress,
  stages,
  onRun,
  error,
  runLabel,
}: {
  packet: ScenarioPacket;
  label: string;
  status: "idle" | "running" | "complete" | "error";
  progress: number;
  stages: readonly string[];
  onRun: () => void;
  error: string | null;
  runLabel: string;
}) {
  return (
    <section className="results-grid results-grid-lab results-grid-single">
      <div className="result-card primary survey-question-card">
        <div className="card-topline">
          <span>{label}</span>
          <ArrowRight size={16} />
        </div>
        <div className="survey-question-head">
          <h1 className="survey-question-copy">{packet.question.canonicalQuestion}</h1>
          <button className="accent-button survey-run-button" onClick={onRun} disabled={status === "running"}>
            {runLabel}
          </button>
        </div>
        <ComputePanel
          status={status}
          progress={progress}
          stages={stages}
          onRun={onRun}
          error={error}
          runLabel={runLabel}
          embedded
          showButton={false}
        />
      </div>
    </section>
  );
}

export function ResultSummarySection({
  summary,
  segments,
}: {
  summary: string;
  segments: SegmentAggregation[];
}) {
  return (
    <section className="results-grid results-grid-lab results-grid-single">
      <div className="result-card primary">
        <div className="summary-callout">
          <strong>{siteCopy.result.resultTitle}</strong>
          <p>{summary}</p>
        </div>
        <div className="segment-summary">
          <div className="result-summary-icon">
            <Activity size={16} />
          </div>
          <h3>{siteCopy.result.segmentTitle}</h3>
        </div>
        <div className="segment-bars">
          {segments.map((segment) => (
            <div key={segment.label} className="segment-row">
              <div className="segment-label">{segment.label}</div>
              <div className="segment-track">
                <span className="support" style={{ width: `${segment.support}%` }} />
                <span className="oppose" style={{ width: `${segment.oppose}%` }} />
                <span className="undecided" style={{ width: `${segment.undecided}%` }} />
              </div>
              <div className="segment-values">
                <small>
                  {segment.support}% {siteCopy.result.supportLabel}
                </small>
                <small>
                  {segment.oppose}% {siteCopy.result.opposeLabel}
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
