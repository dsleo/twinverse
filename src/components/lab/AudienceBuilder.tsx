"use client";

import { useEffect, useMemo, useState } from "react";
import {
  audiencePresetDescriptions,
  audiencePresetLabels,
} from "../../lib/labAudience";
import type {
  AudienceGuidance,
  AudiencePreset,
  LabInput,
  MetadataTagFilter,
  PopulationSegmentDesign,
} from "../../lib/labSchemas";

type Preview = {
  proposal: PopulationSegmentDesign;
  eligibility: Array<{ segmentId: string; eligiblePersonaCount: number }>;
  warnings: string[];
};

type AudienceBuilderProps = {
  input: LabInput;
  audiencePreset: AudiencePreset;
  guidance: AudienceGuidance;
  approvedDesign?: PopulationSegmentDesign;
  disabled?: boolean;
  onAudiencePresetChange: (value: AudiencePreset) => void;
  onGuidanceChange: (value: AudienceGuidance) => void;
  onApprovedDesignChange: (value?: PopulationSegmentDesign) => void;
};

const familyLabels: Record<string, string> = {
  life_stage: "Life stage",
  household_type: "Household",
  employment_class: "Employment",
  income_posture: "Income posture",
  housing_status: "Housing",
  mobility_profile: "Mobility",
  urbanicity: "Place type",
  region_family: "Region",
  public_service_dependency: "Public-service reliance",
  policy_exposure_tags: "Policy exposure",
  economic_vulnerability_tags: "Economic pressure",
  trust_orientation_tags: "Trust orientation",
  issue_salience_tags: "Issue salience",
};

function readableValue(value: string) {
  return value.replaceAll("_", " ");
}

function filterLabel(filter: MetadataTagFilter) {
  return `${familyLabels[filter.family] ?? filter.family}: ${filter.values.map(readableValue).join(", ")}`;
}

export function AudienceBuilder({
  input,
  audiencePreset,
  guidance,
  approvedDesign,
  disabled,
  onAudiencePresetChange,
  onGuidanceChange,
  onApprovedDesignChange,
}: AudienceBuilderProps) {
  const [taxonomy, setTaxonomy] = useState<Record<string, string[]>>({});
  const [family, setFamily] = useState("life_stage");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const families = useMemo(
    () => Object.keys(taxonomy).filter((key) => familyLabels[key]),
    [taxonomy],
  );
  const values = taxonomy[family] ?? [];

  useEffect(() => {
    if (guidance.mode !== "guided" || Object.keys(taxonomy).length > 0) {
      return;
    }
    let cancelled = false;
    void fetch("/api/lab/audience-options", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Unable to load audience attributes.");
        return response.json() as Promise<{
          taxonomy: Record<string, string[]>;
        }>;
      })
      .then((data) => {
        if (!cancelled) setTaxonomy(data.taxonomy);
      })
      .catch((nextError) => {
        if (!cancelled)
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to load audience attributes.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [guidance.mode, taxonomy]);

  useEffect(() => {
    if (families.length && !families.includes(family)) {
      setFamily(families[0]);
    }
  }, [families, family]);

  useEffect(() => {
    setValue(values[0] ?? "");
  }, [family, values]);

  function updateGuidance(next: AudienceGuidance) {
    setPreview(null);
    onApprovedDesignChange(undefined);
    onGuidanceChange(next);
  }

  function addFilter(target: "include" | "avoid") {
    if (!value || guidance[target].length >= 3) return;
    const filter = {
      family: family as MetadataTagFilter["family"],
      values: [value],
    };
    if (
      guidance[target].some(
        (entry) =>
          entry.family === filter.family && entry.values.includes(value),
      )
    )
      return;
    updateGuidance({ ...guidance, [target]: [...guidance[target], filter] });
  }

  async function previewAudience() {
    setError(null);
    setIsPreviewing(true);
    try {
      const response = await fetch("/api/lab/audience-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, audiencePreset, guidance }),
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

  const canPreview =
    input.rawInput.trim().length >= 10 && !disabled && !isPreviewing;
  const isApproved = Boolean(approvedDesign);

  return (
    <fieldset className="audience-builder" disabled={disabled}>
      <legend className="audience-builder-header">
        <span className="section-label">Audience lens</span>
        <strong>Set the people behind the result.</strong>
        <small>Start broad, or direct the simulation toward a specific public.</small>
      </legend>

      <div className="audience-lens-row">
        <label className="audience-builder-field">
          <span>Starting point</span>
          <select
            value={audiencePreset}
            onChange={(event) =>
              onAudiencePresetChange(event.target.value as AudiencePreset)
            }
          >
            {Object.entries(audiencePresetLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p>{audiencePresetDescriptions[audiencePreset]}</p>
      </div>

      <div
        className="audience-mode-toggle"
        role="radiogroup"
        aria-label="Audience mode"
      >
        <label className={guidance.mode === "automatic" ? "active" : ""}>
          <input
            type="radio"
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
            aria-label="Guide the audience"
            checked={guidance.mode === "guided"}
            onChange={() => updateGuidance({ ...guidance, mode: "guided" })}
          />
          <span>Guide the audience</span>
          <small>Set the public and the pressures that matter.</small>
        </label>
      </div>

      {guidance.mode === "guided" ? (
        <div className="audience-guidance-fields">
          <label className="audience-builder-field">
            <span>Describe the public</span>
            <textarea
              value={guidance.brief ?? ""}
              onChange={(event) =>
                updateGuidance({
                  ...guidance,
                  brief: event.target.value.slice(0, 360) || undefined,
                })
              }
              rows={3}
              placeholder="Working parents in secondary cities, concerned about household transport costs."
            />
          </label>

          <div className="audience-filter-picker">
            <label className="audience-builder-field">
              <span>Attribute</span>
              <select
                value={family}
                onChange={(event) => setFamily(event.target.value)}
              >
                {families.map((entry) => (
                  <option key={entry} value={entry}>
                    {familyLabels[entry]}
                  </option>
                ))}
              </select>
            </label>
            <label className="audience-builder-field">
              <span>Value</span>
              <select
                value={value}
                onChange={(event) => setValue(event.target.value)}
              >
                {values.map((entry) => (
                  <option key={entry} value={entry}>
                    {readableValue(entry)}
                  </option>
                ))}
              </select>
            </label>
            <div className="audience-filter-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => addFilter("include")}
                disabled={!value || guidance.include.length >= 3}
              >
                Must include
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => addFilter("avoid")}
                disabled={!value || guidance.avoid.length >= 3}
              >
                Avoid
              </button>
            </div>
          </div>

          <div className="audience-filter-columns">
            <FilterList
              title="Must include"
              filters={guidance.include}
              onRemove={(index) =>
                updateGuidance({
                  ...guidance,
                  include: guidance.include.filter(
                    (_, entry) => entry !== index,
                  ),
                })
              }
            />
            <FilterList
              title="Avoid over-representing"
              filters={guidance.avoid}
              onRemove={(index) =>
                updateGuidance({
                  ...guidance,
                  avoid: guidance.avoid.filter((_, entry) => entry !== index),
                })
              }
            />
          </div>

          <label className="audience-builder-field">
            <span>Set the information lens</span>
            <input
              value={(guidance.priorityConcerns ?? []).join(", ")}
              onChange={(event) =>
                updateGuidance({
                  ...guidance,
                  priorityConcerns: event.target.value
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean)
                    .slice(0, 3),
                })
              }
              placeholder="Household costs, local services, implementation"
            />
            <small>
              Up to three concerns that guide segment design and source selection.
            </small>
          </label>

          <button
            type="button"
            className="quiet-button audience-preview-button"
            onClick={previewAudience}
            disabled={!canPreview}
          >
            {isPreviewing ? "Preparing audience…" : "Preview audience"}
          </button>
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
          <div className="audience-proposal-actions">
            <button
              type="button"
              className="accent-button"
              onClick={() => onApprovedDesignChange(preview.proposal)}
              disabled={preview.warnings.length > 0}
            >
              Use this audience
            </button>
            {isApproved ? (
              <span className="status-pill status-complete">
                Audience approved
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="lab-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function FilterList({
  title,
  filters,
  onRemove,
}: {
  title: string;
  filters: MetadataTagFilter[];
  onRemove: (index: number) => void;
}) {
  return (
    <div className="audience-filter-list">
      <strong>{title}</strong>
      {filters.length ? (
        filters.map((filter, index) => (
          <button
            type="button"
            key={`${filter.family}-${filter.values.join("-")}`}
            onClick={() => onRemove(index)}
          >
            {filterLabel(filter)} <span aria-hidden>×</span>
          </button>
        ))
      ) : (
        <p>None selected</p>
      )}
    </div>
  );
}
