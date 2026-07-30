"use client";

import { useState } from "react";
import type {
  AudienceGuidance,
  LabInput,
  PopulationSegmentDesign,
} from "../../lib/labSchemas";

type Preview = {
  proposal: PopulationSegmentDesign;
  eligibility: Array<{ segmentId: string; eligiblePersonaCount: number }>;
  warnings: string[];
};

type AudienceBuilderProps = {
  input: LabInput;
  guidance: AudienceGuidance;
  approvedDesign?: PopulationSegmentDesign;
  disabled?: boolean;
  onGuidanceChange: (value: AudienceGuidance) => void;
  onApprovedDesignChange: (value?: PopulationSegmentDesign) => void;
};

export function AudienceBuilder({
  input,
  guidance,
  approvedDesign,
  disabled,
  onGuidanceChange,
  onApprovedDesignChange,
}: AudienceBuilderProps) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateGuidance(next: AudienceGuidance) {
    setPreview(null);
    onApprovedDesignChange(undefined);
    onGuidanceChange(next);
  }

  function acceptAudience() {
    if (!preview) return;
    onApprovedDesignChange(preview.proposal);
  }

  function discardAudience() {
    setPreview(null);
    onApprovedDesignChange(undefined);
  }

  async function previewAudience() {
    setError(null);
    setIsPreviewing(true);
    try {
      const response = await fetch("/api/lab/audience-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, audiencePreset: "france_general", guidance }),
      });
      const payload = (await response.json().catch(() => null)) as
        (Preview & { error?: string }) | null;
      if (!response.ok || !payload)
        throw new Error(payload?.error ?? "Unable to preview this audience.");
      setPreview(payload);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to preview this audience.",
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  const hasAudienceBrief = (guidance.brief ?? "").trim().length >= 10;
  const canPreview =
    input.rawInput.trim().length >= 10 &&
    hasAudienceBrief &&
    !disabled &&
    !isPreviewing;
  const isApproved = Boolean(approvedDesign);

  return (
    <fieldset className="audience-builder" disabled={disabled}>
      <legend className="audience-builder-header">
        <span className="section-label">Audience</span>
      </legend>

      <div
        className="audience-mode-toggle"
        role="radiogroup"
        aria-label="Audience mode"
      >
        <label className={guidance.mode === "automatic" ? "active" : ""}>
          <input
            type="radio"
            name="audience-mode"
            aria-label="Let Tweenverse choose"
            checked={guidance.mode === "automatic"}
            onChange={() =>
              updateGuidance({
                mode: "automatic",
                include: [],
                avoid: [],
                priorityConcerns: [],
              })
            }
          />
          <span>Let Tweenverse choose</span>
          <small>Build a balanced five-segment read.</small>
        </label>
        <label className={guidance.mode === "guided" ? "active" : ""}>
          <input
            type="radio"
            name="audience-mode"
            aria-label="Guide the audience"
            checked={guidance.mode === "guided"}
            onChange={() => updateGuidance({ ...guidance, mode: "guided" })}
          />
          <span>Guide the audience</span>
          <small>Set the public and the pressures that matter.</small>
        </label>
      </div>

      {guidance.mode === "guided" && !isApproved ? (
        <div className="audience-guidance-fields">
          <label className="audience-builder-field" htmlFor="audience-brief">
            <span>Describe the public</span>
            <textarea
              id="audience-brief"
              value={guidance.brief ?? ""}
              onChange={(event) =>
                updateGuidance({
                  ...guidance,
                  brief: event.target.value.slice(0, 360) || undefined,
                })
              }
              rows={3}
              placeholder="Working parents in secondary cities, concerned about household transport costs."
              aria-label="Describe the public"
              aria-describedby="audience-brief-help"
            />
            <small id="audience-brief-help">
              {hasAudienceBrief
                ? "Ready to review the five segments."
                : "Describe who you want to understand to review the five segments."}
            </small>
          </label>

          <div className="audience-review-action">
            <button
              type="button"
              className="audience-preview-button"
              onClick={previewAudience}
              disabled={!canPreview}
            >
              {isPreviewing ? "Building the audience…" : "Review the five segments"}
            </button>
            <small className="audience-preview-note">
              This checks the proposed audience only; it does not start the simulation.
            </small>
            {error ? (
              <p className="lab-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {preview ? (
        <section className="audience-proposal" aria-live="polite">
          <div className="audience-proposal-heading">
            <div>
              <div className="section-label">Audience proposal</div>
              <h3>Five ways this question may land.</h3>
            </div>
          </div>
          {preview.warnings.length ? (
            <div className="lab-error">
              {preview.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <ol className="audience-proposal-grid">
            {preview.proposal.segments.map((segment) => {
              const count =
                preview.eligibility.find(
                  (entry) => entry.segmentId === segment.id,
                )?.eligiblePersonaCount ?? 0;
              return (
                <li key={segment.id}>
                  <strong>{segment.label}</strong>
                  <p>{segment.summary}</p>
                  <small>{count} eligible personas</small>
                </li>
              );
            })}
          </ol>
          <div className="audience-approval">
            {isApproved ? (
              <>
                <div>
                  <span className="section-label">Audience accepted</span>
                  <p>Five segments are locked for this simulation.</p>
                </div>
                <button type="button" className="audience-discard" onClick={discardAudience}>
                  Change audience
                </button>
              </>
            ) : (
              <>
                <p>Does this reflect the public you want to test?</p>
                <div>
                  <button type="button" className="audience-accept" onClick={acceptAudience} disabled={preview.warnings.length > 0}>Accept</button>
                  <button type="button" className="audience-discard" onClick={discardAudience}>Discard</button>
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}

      {error && guidance.mode !== "guided" ? (
        <p className="lab-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
