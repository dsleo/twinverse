"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DecisionReport } from "./DecisionReport";
import { AudienceBuilder } from "./AudienceBuilder";
import { PersonaCarousel } from "../personas/PersonaCarousel";
import { TvAudienceResult } from "./TvAudienceResult";
import { runModeLabels } from "../../lib/labAudience";
import type { AudienceGuidance, DailyQuestionPreview, InputType, PersistedLabRun, PopulationSegmentDesign, RunMode } from "../../lib/labSchemas";

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

function percentLabel(value: number) {
  return `${Math.round(value * 100)}%`;
}

function providerLabel(provider: string) {
  switch (provider) {
    case "data_gouv":
      return "data.gouv.fr";
    case "vie_publique":
      return "Vie publique";
    case "rss":
      return "Google News";
    case "reddit":
      return "Reddit";
    default:
      return "Wikipedia";
  }
}

function compactText(value: string, maximum = 112) {
  return value.length > maximum ? `${value.slice(0, maximum - 1).trimEnd()}…` : value;
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
  const [audienceGuidance, setAudienceGuidance] = useState<AudienceGuidance>({ mode: "automatic", include: [], avoid: [], priorityConcerns: [] });
  const [approvedSegmentDesign, setApprovedSegmentDesign] = useState<PopulationSegmentDesign | undefined>();
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<PersistedLabRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedReactionId, setSelectedReactionId] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [isPackOpen, setIsPackOpen] = useState(false);
  const [dailyQuestion, setDailyQuestion] = useState<DailyQuestionPreview | null>(null);
  const [latestTvDate, setLatestTvDate] = useState<{ targetDate: string; reportUrl: string; schedule?: any[] } | null>(null);
  const [isDailyQuestionLoading, setIsDailyQuestionLoading] = useState(fixedMode === "le_figaro_daily" || showModePicker);
  const [isTvDateLoading, setIsTvDateLoading] = useState(fixedMode === "tv_audience_daily");

  const isLeFigaroMode = mode === "le_figaro_daily";
  const isTvMode = mode === "tv_audience_daily";

  const heroTitle = isLeFigaroMode && !showModePicker ? "Le Figaro, as it lands." : isTvMode ? "TV Audience Prediction" : "Ask. See how it lands.";
  const heroLede =
    isLeFigaroMode && !showModePicker
      ? ""
      : isTvMode
        ? "Simulate how French audiences choose their evening programs based on persona traits and schedule context."
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
    if (!isTvMode) {
      setIsTvDateLoading(false);
      return;
    }

    let cancelled = false;
    async function loadLatestTvDate() {
      setIsTvDateLoading(true);
      try {
        const response = await fetch(`/api/lab/tv-latest-date?t=${Date.now()}`, { cache: "no-store" });
        const data = await response.json();
        if (cancelled) {
          return;
        }
        setLatestTvDate(data);
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error("Failed to load latest TV date:", error);
      } finally {
        if (!cancelled) {
          setIsTvDateLoading(false);
        }
      }
    }

    void loadLatestTvDate();

    return () => {
      cancelled = true;
    };
  }, [isTvMode]);

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
        window.setTimeout(poll, 2500);
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
      const isTvMode = mode === "tv_audience_daily";
      const targetDate = isTvMode ? (latestTvDate?.targetDate ?? "2026-06-09") : undefined;

      const response = await fetch("/api/lab/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          rawInput: mode === "manual" ? rawInput : undefined,
          inputType: isTvMode ? "other" : ("question" satisfies InputType),
          date: targetDate,
          audienceGuidance: mode === "manual" ? audienceGuidance : undefined,
          approvedSegmentDesign: mode === "manual" ? approvedSegmentDesign : undefined,
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
  const sourcesById = useMemo(() => new Map((run?.retrieval?.sources ?? []).map((source) => [source.id, source])), [run?.retrieval?.sources]);
  const receivingSegmentsBySourceId = useMemo(() => {
    const receivedBy = new Map<string, string[]>();
    for (const pack of run?.contextPacks ?? []) {
      for (const sourceId of pack.supportingSourceIds) {
        const labels = receivedBy.get(sourceId) ?? [];
        labels.push(pack.label);
        receivedBy.set(sourceId, labels);
      }
    }
    return receivedBy;
  }, [run?.contextPacks]);
  const retainedSourceGroups = useMemo(() => {
    const sources = (run?.retrieval?.sources ?? []).filter((source) => source.provenance === "live");
    const decisions = run?.retrieval?.plan?.providerDecisions;
    if (decisions) {
      return decisions
        .map((decision) => ({
          key: `${decision.provider}:${decision.query}`,
          provider: decision.provider,
          reason: decision.reason,
          sources: sources.filter((source) => source.provider === decision.provider && source.query === decision.query),
        }))
        .filter((group) => group.sources.length > 0);
    }

    return Array.from(
      sources.reduce((groups, source) => {
        const key = `${source.provider}:${source.query}`;
        const group = groups.get(key) ?? { key, provider: source.provider, reason: undefined, sources: [] as typeof sources };
        group.sources.push(source);
        groups.set(key, group);
        return groups;
      }, new Map<string, { key: string; provider: string; reason: string | undefined; sources: typeof sources }>()),
    ).map(([, group]) => group);
  }, [run?.retrieval]);
  const selectedSegmentSources = selectedSegmentPack?.supportingSourceIds.map((sourceId) => sourcesById.get(sourceId)).filter((source): source is NonNullable<typeof source> => Boolean(source)) ?? [];
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
        { id: "summary-report", label: "Report", value: run.aggregateReport ? "Ready" : "Pending", targetId: "lab-decision-report" },
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
  const isRunActive = run?.status === "running";
  const submitDisabled =
    isRunActive ||
    (mode === "manual"
      ? rawInput.trim().length < 10 || (audienceGuidance.mode === "guided" && !approvedSegmentDesign)
      : mode === "le_figaro_daily"
        ? isDailyQuestionLoading || !leFigaroAvailable
        : false);

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
          ) : isTvMode ? (
            <article className="lab-readonly-prompt">
              <div className="card-topline">
                <div className="section-label">{isTvDateLoading ? "Loading..." : formatQuestionDate(latestTvDate?.targetDate)}</div>
                {latestTvDate?.reportUrl && (
                  <a href={latestTvDate.reportUrl} target="_blank" rel="noreferrer" className="text-link" style={{ fontSize: "0.8rem" }}>
                    Source article
                  </a>
                )}
              </div>
              {latestTvDate?.schedule && latestTvDate.schedule.length > 0 ? (
                <ul className="lab-schedule-grid">
                  {latestTvDate.schedule.slice(0, 10).map((item, i) => (
                    <li key={i} className="lab-schedule-item">
                      <div className="lab-schedule-channel">
                        {item.channelLogoUrl ? (
                          <img
                            src={item.channelLogoUrl}
                            alt={item.channel}
                            style={{
                              display: "block",
                              width: "100%",
                              height: "2.1rem",
                              objectFit: "contain",
                            }}
                          />
                        ) : (
                          <span style={{ fontWeight: "bold", opacity: 0.9 }}>{item.channel}</span>
                        )}
                      </div>
                      <div className="lab-schedule-copy">
                        <span className="lab-schedule-program">{item.programName}</span>
                      </div>
                      <div className="lab-schedule-genre">{item.genre ?? ""}</div>
                    </li>
                  ))}
                </ul>
              ) : isTvDateLoading ? null : (
                <p style={{ marginTop: "1rem", fontSize: "0.9rem", opacity: 0.6 }}>No schedule data available for this date.</p>
              )}
            </article>
          ) : (
            <textarea
              id="lab-input"
              value={rawInput}
              onChange={(event) => {
                setRawInput(event.target.value);
                setApprovedSegmentDesign(undefined);
              }}
              minLength={10}
              rows={5}
              aria-describedby="lab-input-error"
              aria-invalid={Boolean(error)}
              placeholder="Paste a question, article, proposal, or speech"
            />
          )}

          {mode === "manual" ? (
            <AudienceBuilder
              input={{ rawInput, inputType: "question" }}
              guidance={audienceGuidance}
              approvedDesign={approvedSegmentDesign}
              disabled={isRunActive}
              onGuidanceChange={setAudienceGuidance}
              onApprovedDesignChange={setApprovedSegmentDesign}
            />
          ) : null}

          <div className="lab-command-row">
            <button type="submit" className="accent-button" disabled={submitDisabled}>
              {isRunActive ? "Running…" : "Run"}
            </button>
            <div className="lab-status" aria-live="polite">
              {run ? (
                <>
                  {run.status === "running" ? null : (
                    <span
                      className={`status-pill ${
                        run.status === "failed" ? "" : run.status === "completed" ? "status-complete" : "status-running"
                      }`}
                    >
                      {run.status}
                    </span>
                  )}
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
          {run.audienceGuidance.mode === "guided" ? (
            <details className="audience-definition">
              <summary>Audience definition</summary>
              {run.audienceGuidance.brief ? <p>{run.audienceGuidance.brief}</p> : null}
              {run.audienceGuidance.include.length ? <p><strong>Must include:</strong> {run.audienceGuidance.include.map((filter) => `${filter.family.replaceAll("_", " ")}: ${filter.values.join(", ")}`).join(" · ")}</p> : null}
              {run.audienceGuidance.avoid.length ? <p><strong>Avoid over-representing:</strong> {run.audienceGuidance.avoid.map((filter) => `${filter.family.replaceAll("_", " ")}: ${filter.values.join(", ")}`).join(" · ")}</p> : null}
              {run.audienceGuidance.priorityConcerns.length ? <p><strong>Priority concerns:</strong> {run.audienceGuidance.priorityConcerns.join(" · ")}</p> : null}
            </details>
          ) : null}
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

      {run?.aggregateReport ? <DecisionReport run={run} /> : null}

      {run?.tvPredictions && run.tvPredictions.length > 0 ? (
        <section id="tv-predictions" className="lab-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">TV audience predictions</div>
              <h2>Predicted vs. actual market share</h2>
            </div>
          </div>
          <TvAudienceResult run={run} />
        </section>
      ) : null}

      {run?.retrieval ? (
        <details id="lab-sources" className="lab-card lab-collapsible" open>
          <summary className="lab-summary-toggle">
            <div>
              <div className="section-label">Evidence trace</div>
              <h2>Why these sources were selected</h2>
            </div>
          </summary>
          {retainedSourceGroups.length === 0 ? <p className="source-reason">No live source was retained for this run.</p> : null}
          <div className="source-provenance-grid">
            {retainedSourceGroups.map((group) => (
              <details key={group.key} className="source-row source-group">
                <summary className="source-group-summary">
                  <div>
                    <div className="source-provider-line">Retained source</div>
                    <h3>{providerLabel(group.provider)}</h3>
                    {group.reason ? <p>{compactText(group.reason)}</p> : null}
                  </div>
                  <span className="source-tag">{group.sources.length} item{group.sources.length === 1 ? "" : "s"}</span>
                </summary>
                <div className="source-item-list">
                  {group.sources.map((source) => {
                    const showTitle = !source.sourceName || !source.title.trim().toLocaleLowerCase().includes(source.sourceName.trim().toLocaleLowerCase());
                    return (
                      <article key={source.id} className="source-item">
                        {showTitle ? <h4>{source.title}</h4> : null}
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
                        {(receivingSegmentsBySourceId.get(source.id) ?? []).length ? (
                          <p className="source-recipients">
                            <strong>Received by</strong> {receivingSegmentsBySourceId.get(source.id)?.join(" · ")}
                          </p>
                        ) : null}
                        <p>{source.snippet}</p>
                      </article>
                    );
                  })}
                </div>
              </details>
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
            <div className="source-explanation">
              <strong>Sources supplied to this segment</strong>
              {selectedSegmentSources.length ? (
                <ul>{selectedSegmentSources.map((source) => <li key={source.id}>{source.sourceName ?? source.provider}: {source.title}</li>)}</ul>
              ) : (
                <p>No live source was supplied to this segment.</p>
              )}
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
