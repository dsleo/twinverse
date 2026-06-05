"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PersonaCarousel } from "../personas/PersonaCarousel";
import { audiencePresetDescriptions, runModeLabels } from "../../lib/labAudience";
import type { DailyQuestionPreview, InputType, PersistedLabRun, RunMode } from "../../lib/labSchemas";

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

function emotionEmoji(emotion: PersistedLabRun["reactions"][number]["emotionalState"]) {
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

function stanceLabel(stance: PersistedLabRun["reactions"][number]["stance"]) {
  return stance.replaceAll("_", " ");
}

function activeStage(run: PersistedLabRun | null) {
  if (!run) {
    return null;
  }
  return run.steps.find((step) => step.status === "running") ?? run.steps.find((step) => step.status === "failed") ?? null;
}

function formatQuestionDate(value?: string) {
  if (!value) {
    return "Aujourd’hui";
  }

  const date = new Date(`${value}T12:00:00+02:00`);
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

type LabPageClientProps = {
  fixedMode?: RunMode;
  showModePicker?: boolean;
};

export function LabPageClient({ fixedMode, showModePicker = false }: LabPageClientProps) {
  const [mode, setMode] = useState<RunMode>(fixedMode ?? "manual");
  const [rawInput, setRawInput] = useState("Faut-il construire de nouvelles centrales nucléaires en France ?");
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<PersistedLabRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedReactionId, setSelectedReactionId] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [isPackOpen, setIsPackOpen] = useState(false);
  const [dailyQuestion, setDailyQuestion] = useState<DailyQuestionPreview | null>(null);
  const [isDailyQuestionLoading, setIsDailyQuestionLoading] = useState(fixedMode === "le_figaro_daily" || showModePicker);

  const isLeFigaroMode = mode === "le_figaro_daily";
  const heroTitle = isLeFigaroMode && !showModePicker ? "Le Figaro, as it lands." : "Ask. See how it lands.";
  const heroLede =
    isLeFigaroMode && !showModePicker
      ? ""
      : "An agentic system combines live context with tailored synthetic personas to simulate audience reaction.";

  useEffect(() => {
    if (fixedMode) {
      setMode(fixedMode);
    }
  }, [fixedMode]);

  useEffect(() => {
    if (!isLeFigaroMode && !showModePicker) {
      setIsDailyQuestionLoading(false);
      return;
    }

    let cancelled = false;

    async function loadDailyQuestion() {
      setIsDailyQuestionLoading(true);

      try {
        const response = await fetch(`/api/lab/daily-question?source=le_figaro&t=${Date.now()}`, { cache: "no-store" });
        const preview = (await response.json()) as DailyQuestionPreview;
        if (cancelled) {
          return;
        }
        setDailyQuestion(preview);
      } catch (nextError) {
        if (cancelled) {
          return;
        }
        setDailyQuestion({
          status: "unavailable",
          source: "le_figaro",
          message: nextError instanceof Error ? nextError.message : "Unable to load today’s question.",
        });
      } finally {
        if (!cancelled) {
          setIsDailyQuestionLoading(false);
        }
      }
    }

    void loadDailyQuestion();

    return () => {
      cancelled = true;
    };
  }, [isLeFigaroMode, showModePicker]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(`/api/lab/runs/${runId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to load run state.");
        }
        const nextRun = (await response.json()) as PersistedLabRun;
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
      const response = await fetch("/api/lab/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          rawInput: mode === "manual" ? rawInput : undefined,
          inputType: "question" satisfies InputType,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Unable to start the run.");
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
        { id: "summary-panel", label: "Segments", value: `${run.populationMap?.segments.length ?? 0}`, targetId: "lab-population" },
        { id: "summary-reactions", label: "Reactions", value: `${run.reactions.length}`, targetId: "lab-reactions" },
        { id: "summary-sources", label: "Sources", value: `${run.retrieval?.sources.length ?? 0}`, targetId: "lab-sources" },
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
                badgeClassName: `lab-stance lab-stance-${reaction.stance}`,
              },
            ]
          : [];
      }) ?? [],
    [run],
  );

  const leFigaroAvailable = dailyQuestion?.status === "available";
  const submitDisabled =
    run?.status === "running" ||
    (mode === "manual" ? rawInput.trim().length < 10 : isDailyQuestionLoading || !leFigaroAvailable);

  return (
    <div className="lab-page page-shell">
      <section className="lab-hero hero-copy">
        <div className="eyebrow">Lab</div>
        <h1>{heroTitle}</h1>
        {heroLede ? <p className="hero-lede">{heroLede}</p> : null}
      </section>

      {showModePicker ? (
        <section className="lab-card lab-mode-shell">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Mode</div>
              <h2>Choose the prompt source</h2>
            </div>
          </div>

          <div className="lab-mode-grid" role="list">
            <button
              type="button"
              className={`lab-mode-card ${mode === "manual" ? "active" : ""}`}
              onClick={() => setMode("manual")}
              aria-pressed={mode === "manual"}
            >
              <span className="lab-mode-kicker">Freeform</span>
              <strong>{runModeLabels.manual}</strong>
              <p>Use your own question and keep the default France-wide audience lens.</p>
            </button>

            <button
              type="button"
              className={`lab-mode-card ${mode === "le_figaro_daily" ? "active" : ""}`}
              onClick={() => setMode("le_figaro_daily")}
              aria-pressed={mode === "le_figaro_daily"}
            >
              <span className="lab-mode-kicker">Daily signal</span>
              <strong>{runModeLabels.le_figaro_daily}</strong>
              <p>Run the official question of the day with a panel weighted toward Le Figaro readership.</p>
            </button>
          </div>
        </section>
      ) : null}

      <section className="lab-card lab-command">
        <form onSubmit={handleSubmit} className="lab-form">
          {isLeFigaroMode ? (
            <article className="lab-readonly-prompt">
              <div className="card-topline">
                <div>
                  <div className="section-label">Question du jour</div>
                  {leFigaroAvailable ? <p className="lab-question-date">{formatQuestionDate(dailyQuestion.promptSource.questionDate)}</p> : null}
                </div>
              </div>

              {leFigaroAvailable ? <p className="lab-readonly-question">{dailyQuestion.question}</p> : <p>{dailyQuestion?.message ?? "Loading today’s Le Figaro question."}</p>}
            </article>
          ) : (
            <textarea
              id="lab-input"
              value={rawInput}
              onChange={(event) => setRawInput(event.target.value)}
              minLength={10}
              rows={5}
              aria-describedby="lab-input-error"
              aria-invalid={Boolean(error)}
              placeholder="Paste a question, article, proposal, or speech"
            />
          )}

          {mode === "manual" ? (
            <p className="lab-mode-note">{audiencePresetDescriptions.france_general}</p>
          ) : null}

          <div className="lab-command-row">
            <button type="submit" className="accent-button" disabled={submitDisabled}>
              {run?.status === "running" ? "Running" : "Run pipeline"}
            </button>
            <div className="lab-status" aria-live="polite">
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
            <p id="lab-input-error" className="lab-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </section>

      {run ? (
        <section className="lab-card lab-summary">
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
        <section className="lab-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Pipeline</div>
              <h2>Step status</h2>
            </div>
          </div>
          <div className="lab-step-list">
            {run.steps.map((step) => (
              <article key={step.id} className={`lab-step-card lab-step-${step.status}`}>
                <div className="card-topline">
                  <strong>{step.label}</strong>
                  <span className={`status-pill ${step.status === "completed" ? "status-complete" : step.status === "running" ? "status-running" : ""}`}>
                    {step.status}
                  </span>
                </div>
                {step.summary ? <p>{step.summary}</p> : null}
                {step.error ? <p className="lab-error">{step.error}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {run?.populationMap ? (
        <section id="lab-population" className="lab-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Population map</div>
              <h2>{run.audiencePreset === "le_figaro_reader" ? "Reader-weighted segments" : "Question-driven segments"}</h2>
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
        <section id="lab-reactions" className="lab-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Reactions</div>
              <h2>Persona reactions</h2>
            </div>
          </div>
          <PersonaCarousel items={personaItems} selectedId={selectedReactionId} onToggle={(id) => setSelectedReactionId((current) => (current === id ? "" : id))} />
          {selectedReaction && selectedPersona ? (
            <div className="persona-detail-card persona-detail-inline lab-reaction-detail">
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
        <section id="lab-divergence" className="lab-card">
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
          <p className="lab-warning">{run.aggregateReport.caveats.join(" ")}</p>
        </section>
      ) : null}

      {run?.retrieval?.sources.length ? (
        <details id="lab-sources" className="lab-card lab-collapsible" open>
          <summary className="lab-summary-toggle">
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
        <dialog className="lab-pack-dialog" open>
          <div className="lab-pack-dialog-backdrop" onClick={() => setIsPackOpen(false)} />
          <div className="lab-pack-sheet" role="document" aria-modal="true">
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
