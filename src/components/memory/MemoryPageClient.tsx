"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PersonaCarousel } from "../personas/PersonaCarousel";
import type { InputType, PersistedMemoryRun } from "../../lib/memorySchemas";

type JumpCard = {
  id: string;
  label: string;
  value: string;
  targetId: string;
};

function jumpToSection(targetId: string) {
  window.setTimeout(() => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 40);
}

function emotionEmoji(emotion: PersistedMemoryRun["reactions"][number]["emotionalState"]) {
  switch (emotion) {
    case "hopeful":
      return "🙂";
    case "concerned":
      return "😟";
    case "skeptical":
      return "🤨";
    case "angry":
      return "😠";
    case "calm":
      return "😌";
    default:
      return "😕";
  }
}

function stanceLabel(stance: PersistedMemoryRun["reactions"][number]["stance"]) {
  return stance.replaceAll("_", " ");
}

function activeStage(run: PersistedMemoryRun | null) {
  if (!run) {
    return null;
  }
  return run.steps.find((step) => step.status === "running") ?? run.steps.find((step) => step.status === "failed") ?? null;
}

export function MemoryPageClient() {
  const [rawInput, setRawInput] = useState("Faut-il construire de nouvelles centrales nucléaires en France ?");
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<PersistedMemoryRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedReactionId, setSelectedReactionId] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [isPackOpen, setIsPackOpen] = useState(false);

  useEffect(() => {
    if (!runId) {
      return;
    }

    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(`/api/memory/runs/${runId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to load run state.");
        }
        const nextRun = (await response.json()) as PersistedMemoryRun;
        if (cancelled) {
          return;
        }
        setRun(nextRun);
        if (nextRun.status === "completed" || nextRun.status === "failed") {
          return;
        }
        window.setTimeout(poll, 1000);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Unable to refresh the run.");
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    if (!run?.populationMap?.segments.length) {
      setSelectedSegmentId("");
      return;
    }
    setSelectedSegmentId((current) => current || run.populationMap!.segments[0].id);
  }, [run]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setRun(null);
    setRunId(null);
    setSelectedReactionId("");
    setSelectedSegmentId("");
    setIsPackOpen(false);

    try {
      const response = await fetch("/api/memory/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rawInput,
          inputType: "question" satisfies InputType,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to start the run.");
      }

      const body = (await response.json()) as { runId: string };
      setRunId(body.runId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to start the run.");
    }
  }

  const currentStage = activeStage(run);
  const selectedSegment = run?.populationMap?.segments.find((segment) => segment.id === selectedSegmentId) ?? run?.populationMap?.segments[0] ?? null;
  const selectedSegmentPack = run?.contextPacks.find((pack) => pack.segmentId === selectedSegment?.id) ?? null;
  const selectedReaction = run?.reactions.find((reaction) => `${reaction.segmentId}-${reaction.personaId}` === selectedReactionId) ?? null;
  const selectedPersona = run?.panel.find((persona) => persona.id === selectedReaction?.personaId) ?? null;
  const selectedPack = run?.contextPacks.find((pack) => pack.id === selectedReaction?.contextPackId) ?? null;
  const segmentSamplePersonas = selectedSegment
    ? selectedSegment.representativePersonaIds
        .map((personaId) => run?.panel.find((persona) => persona.id === personaId))
        .filter((persona): persona is NonNullable<typeof persona> => Boolean(persona))
    : [];

  const summaryCards: JumpCard[] = run
    ? [
        { id: "summary-panel", label: "Segments", value: `${run.populationMap?.segments.length ?? 0}`, targetId: "memory-population" },
        { id: "summary-reactions", label: "Reactions", value: `${run.reactions.length}`, targetId: "memory-reactions" },
        { id: "summary-sources", label: "Sources", value: `${run.retrieval?.sources.length ?? 0}`, targetId: "memory-sources" },
      ]
    : [];

  const personaItems = useMemo(
    () =>
      run?.reactions.flatMap((reaction) => {
        const persona = run.panel.find((entry) => entry.id === reaction.personaId);
        const segment = run.populationMap?.segments.find((entry) => entry.id === reaction.segmentId);
        return persona
          ? [
              {
                id: `${reaction.segmentId}-${reaction.personaId}`,
                title: persona.name,
                subtitle: persona.occupation,
                meta: `${persona.city} · ${persona.age} · ${emotionEmoji(reaction.emotionalState)}`,
                badge: segment?.label ?? stanceLabel(reaction.stance),
                badgeClassName: `memory-stance memory-stance-${reaction.stance}`,
              },
            ]
          : [];
      }) ?? [],
    [run],
  );

  return (
    <div className="memory-page page-shell">
      <section className="memory-hero hero-copy">
        <div className="eyebrow">Memory Lab</div>
        <h1>Ask. See how it lands.</h1>
        <p className="hero-lede">
          An agentic system combines live context with tailored synthetic personas to simulate audience reaction.
        </p>
      </section>

      <section className="memory-card memory-command">
        <form onSubmit={handleSubmit} className="memory-form">
          <textarea
            id="memory-input"
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            minLength={10}
            rows={5}
            aria-describedby="memory-input-error"
            aria-invalid={Boolean(error)}
            placeholder="Paste a question, article, proposal, or speech"
          />

          <div className="memory-command-row">
            <button type="submit" className="accent-button" disabled={rawInput.trim().length < 10 || run?.status === "running"}>
              {run?.status === "running" ? "Running" : "Run pipeline"}
            </button>
            <div className="memory-status" aria-live="polite">
              {run ? (
                <>
                  <span
                    className={`status-pill ${
                      run.status === "failed" ? "" : run.status === "completed" ? "status-complete" : "status-running"
                    }`}
                  >
                    {run.status}
                  </span>
                  {currentStage?.summary ? <p>{currentStage.summary}</p> : null}
                </>
              ) : null}
            </div>
          </div>

          {error ? (
            <p id="memory-input-error" className="memory-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </section>

      {run ? (
        <section className="memory-card memory-summary">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Run summary</div>
              <h2>At a glance</h2>
            </div>
          </div>
          <div className="summary-grid">
            {summaryCards.map((item) => (
              <button key={item.id} type="button" className="summary-card summary-card-button" onClick={() => jumpToSection(item.targetId)}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {run?.steps?.length ? (
        <section className="memory-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Pipeline</div>
              <h2>Step status</h2>
            </div>
          </div>
          <div className="memory-step-list">
            {run.steps.map((step) => (
              <article key={step.id} className={`memory-step-card memory-step-${step.status}`}>
                <div className="card-topline">
                  <strong>{step.label}</strong>
                  <span className={`status-pill ${step.status === "completed" ? "status-complete" : step.status === "running" ? "status-running" : ""}`}>
                    {step.status}
                  </span>
                </div>
                {step.summary ? <p>{step.summary}</p> : null}
                {step.error ? <p className="memory-error">{step.error}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {run?.populationMap ? (
        <section id="memory-population" className="memory-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Population map</div>
              <h2>Question-driven segments</h2>
            </div>
          </div>
          <div className="segment-explorer">
            <div className="segment-list" role="list">
              {run.populationMap.segments.map((segment) => {
                const isActive = selectedSegmentId === segment.id;
                return (
                  <button
                    key={segment.id}
                    type="button"
                    className={`segment-button ${isActive ? "active" : ""}`}
                    onClick={() => setSelectedSegmentId(segment.id)}
                    role="listitem"
                    aria-pressed={isActive}
                  >
                    <div className="segment-button-topline">
                      <strong>{segment.label}</strong>
                      <span>{segment.memberPersonaIds.length}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedSegment ? (
              <article className="sub-card population-card segment-preview">
                <div className="card-topline">
                  <h3>{selectedSegment.label}</h3>
                  <button type="button" className="icon-button" onClick={() => setIsPackOpen(true)} aria-label="Open context pack">
                    <span aria-hidden="true">+</span>
                  </button>
                </div>
                <p>{selectedSegment.summary}</p>
                <div className="inline-facts">
                  <span>
                    <strong>Concerns:</strong> {selectedSegment.concerns.join(", ")}
                  </span>
                  <span>
                    <strong>Needs:</strong> {selectedSegment.informationNeeds.join(", ")}
                  </span>
                </div>
                {segmentSamplePersonas.length > 0 ? (
                  <div className="segment-personas">
                    <strong>Representative voices</strong>
                    <div className="segment-persona-list">
                      {segmentSamplePersonas.map((persona) => (
                        <span key={persona.id} className="segment-persona-chip">
                          {persona.name} · {persona.city}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      {run?.reactions.length ? (
        <section id="memory-reactions" className="memory-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Reactions</div>
              <h2>Evaluated personas</h2>
            </div>
          </div>
          <PersonaCarousel items={personaItems} selectedId={selectedReactionId} onToggle={(id) => setSelectedReactionId((current) => (current === id ? "" : id))} />
          {selectedReaction && selectedPersona ? (
            <div className="persona-detail-card persona-detail-inline memory-reaction-detail">
              <div className="persona-detail-grid">
                <div className="detail-group">
                  <label>City</label>
                  <p>{selectedPersona.city}</p>
                </div>
                <div className="detail-group">
                  <label>Household</label>
                  <p>{selectedPersona.household}</p>
                </div>
                <div className="detail-group">
                  <label>Confidence</label>
                  <p>{selectedReaction.confidence}/5</p>
                </div>
                <div className="detail-group detail-group-wide">
                  <label>Context pack</label>
                  <p>{selectedPack?.label ?? "Unassigned"}</p>
                </div>
                <div className="detail-group detail-group-wide">
                  <label>Core concerns</label>
                  <p>{selectedPersona.concerns.join(" / ")}</p>
                </div>
              </div>
              <div className="persona-response-list">
                <div className="persona-response-row">
                  <label>Read</label>
                  <p>{selectedReaction.reactionSummary}</p>
                </div>
                <div className="persona-response-row">
                  <label>Quote</label>
                  <p>{selectedReaction.quote}</p>
                </div>
                <div className="persona-response-row">
                  <label>Impact</label>
                  <p>{selectedReaction.perceivedImpact}</p>
                </div>
                {selectedReaction.misunderstanding ? (
                  <div className="persona-response-row">
                    <label>Risk</label>
                    <p>{selectedReaction.misunderstanding}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {run?.aggregateReport ? (
        <section id="memory-divergence" className="memory-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Divergence report</div>
              <h2>How the evaluated panel splits</h2>
            </div>
          </div>
          <p>{run.aggregateReport.executiveSummary}</p>
          <p>{run.aggregateReport.overallPattern}</p>
          <ul>
            {run.aggregateReport.mainDivergences.map((item) => (
              <li key={item.title}>
                <strong>{item.title}:</strong> {item.description}
              </li>
            ))}
          </ul>
          <p className="memory-warning">{run.aggregateReport.caveats.join(" ")}</p>
        </section>
      ) : null}

      {run?.retrieval?.sources.length ? (
        <details id="memory-sources" className="memory-card memory-collapsible" open>
          <summary className="memory-summary-toggle">
            <div>
              <div className="section-label">Source provenance</div>
              <h2>Sources</h2>
            </div>
          </summary>
          <div className="source-provenance-grid">
            {run.retrieval.sources.map((source) => (
              <article key={source.id} className="source-row">
                <div className="source-row-topline">
                  <div style={{ minWidth: 0 }}>
                    <h3>{source.title}</h3>
                  </div>
                  <span className={`status-pill ${source.provenance === "live" ? "status-complete" : ""}`}>{source.provenance}</span>
                </div>
                {source.sourceName ? (
                  source.url ? (
                    <a className="source-tag source-link" href={source.url} target="_blank" rel="noreferrer">
                      <span>{source.sourceName}</span>
                      <small style={{ marginLeft: "4px" }}>↗</small>
                    </a>
                  ) : (
                    <span className="source-tag">{source.sourceName}</span>
                  )
                ) : null}
                <p>{source.snippet}</p>
                {source.failureReason ? (
                  <p className="source-reason">
                    <strong>Reason:</strong> {source.failureReason}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </details>
      ) : null}

      {selectedSegmentPack && isPackOpen ? (
        <dialog className="memory-pack-dialog" open>
          <div className="memory-pack-dialog-backdrop" onClick={() => setIsPackOpen(false)} />
          <div className="memory-pack-sheet" role="document" aria-modal="true">
            <div className="card-topline">
              <div>
                <div className="section-label">Context pack</div>
                <h2>{selectedSegmentPack.label}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setIsPackOpen(false)} aria-label="Close context pack">
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <p>{selectedSegmentPack.conciseBriefing}</p>
            <div className="inline-facts">
              <span>
                <strong>Known:</strong> {selectedSegmentPack.likelyKnownFacts.join(" | ")}
              </span>
              <span>
                <strong>Ignored:</strong> {selectedSegmentPack.likelyIgnoredFacts.join(" | ")}
              </span>
              <span>
                <strong>Practical:</strong> {selectedSegmentPack.practicalImplications.join(" | ")}
              </span>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
