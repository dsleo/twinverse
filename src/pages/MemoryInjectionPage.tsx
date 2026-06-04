import { useEffect, useState, type FormEvent } from "react";
import { PersonaCarousel } from "../components/personas/PersonaCarousel";
import { executeMemoryInjection, type InputType, type MemoryInjectionRun } from "../lib/memoryInjection";

const pipelineStages = [
  "Mapping the panel",
  "Pulling source signals",
  "Building context packs",
  "Simulating reactions",
  "Writing the split",
] as const;

type JumpCard = {
  id: string;
  label: string;
  value: string;
  targetId: string;
  onBeforeJump?: () => void;
};

function jumpToSection(targetId: string, onBeforeJump?: () => void) {
  onBeforeJump?.();
  window.setTimeout(() => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 40);
}

function stanceLabel(stance: MemoryInjectionRun["reactions"][number]["stance"]) {
  return stance.replace("_", " ");
}

function emotionEmoji(emotion: MemoryInjectionRun["reactions"][number]["emotionalState"]) {
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

export function MemoryInjectionPage() {
  const [rawInput, setRawInput] = useState("Faut-il construire de nouvelles centrales nucléaires en France ?");
  const [inputType] = useState<InputType>("question");
  const [run, setRun] = useState<MemoryInjectionRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [selectedReactionId, setSelectedReactionId] = useState<string>("");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>("");
  const [isPackOpen, setIsPackOpen] = useState(false);

  useEffect(() => {
    if (!isRunning) {
      setStageIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setStageIndex((current) => Math.min(current + 1, pipelineStages.length - 1));
    }, 850);

    return () => window.clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (!run?.reactions.length) {
      setSelectedReactionId("");
      return;
    }
  }, [run]);

  useEffect(() => {
    if (!run?.populationMap?.segments.length) {
      setSelectedSegmentId("");
      return;
    }

    setSelectedSegmentId(run.populationMap.segments[0].id);
  }, [run]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsRunning(true);
    setError(null);
    setRun(null);
    setIsPackOpen(false);
    setSelectedReactionId("");
    try {
      const nextRun = await executeMemoryInjection({ rawInput, inputType });
      setRun(nextRun);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to build the readout.");
    } finally {
      setIsRunning(false);
    }
  }

  const selectedReaction = run?.reactions.find((reaction) => reaction.personaId === selectedReactionId) ?? null;
  const selectedSegment = run?.populationMap?.segments.find((segment) => segment.id === selectedSegmentId) ?? run?.populationMap?.segments[0] ?? null;
  const selectedSegmentPack = run?.contextPacks.find((pack) => pack.targetSegmentId === selectedSegment?.id) ?? null;
  const selectedPersona = run?.panel.find((persona) => persona.id === selectedReaction?.personaId) ?? null;
  const selectedPack = run?.contextPacks.find((pack) => pack.id === selectedReaction?.contextPackId) ?? null;

  const summaryCards: JumpCard[] = run
    ? [
        { id: "summary-panel", label: "Segments", value: `${run.populationMap?.segments.length ?? 0}`, targetId: "memory-population" },
        {
          id: "summary-packs",
          label: "Packs",
          value: `${run.contextPacks.length}`,
          targetId: "memory-population",
          onBeforeJump: () => setIsPackOpen(true),
        },
        { id: "summary-reactions", label: "Reactions", value: `${run.reactions.length}`, targetId: "memory-reactions" },
        { id: "summary-sources", label: "Sources", value: `${run.retrievedSources.length}`, targetId: "memory-sources" },
      ]
    : [];

  return (
    <div className="memory-page">
      <section className="memory-hero">
        <div className="eyebrow">Personalized Memory Injection</div>
        <h1>Prime the panel before you read reactions.</h1>
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
            <button type="submit" className="accent-button" disabled={isRunning || rawInput.trim().length < 10}>
              {isRunning ? "Running" : "Run pipeline"}
            </button>
            <div className="memory-status" aria-live="polite">
              {isRunning || run ? (
                <>
                  <span className={`status-pill ${isRunning ? "status-running" : "status-complete"}`}>
                    {isRunning ? "In progress" : "Ready"}
                  </span>
                  {isRunning ? <p>{pipelineStages[stageIndex]}</p> : null}
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
              <button
                key={item.id}
                type="button"
                className="summary-card summary-card-button"
                onClick={() => jumpToSection(item.targetId, item.onBeforeJump)}
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {run ? (
        <section id="memory-population" className="memory-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Population map</div>
              <h2>Five audience clusters</h2>
            </div>
          </div>
          <div className="segment-explorer">
            <div className="segment-list" role="list">
              {run.populationMap?.segments.map((segment) => {
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
                      <span>{segment.targetPersonaIds.length}</span>
                    </div>
                    <p>{segment.description}</p>
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
                    <span className="sr-only">Open context pack</span>
                  </button>
                </div>
                <p>{selectedSegment.description}</p>
                <div className="inline-facts">
                  <span><strong>Concerns:</strong> {selectedSegment.likelyConcerns.join(", ")}</span>
                  <span><strong>Needs:</strong> {selectedSegment.informationNeeds.join(", ")}</span>
                </div>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      {run ? (
        <section id="memory-reactions" className="memory-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Reactions</div>
              <h2>Panel responses</h2>
            </div>
          </div>
          <PersonaCarousel
            items={run.reactions.flatMap((reaction) => {
              const persona = run.panel.find((entry) => entry.id === reaction.personaId);
              return persona
                ? [
                    {
                      id: reaction.personaId,
                      title: persona.name,
                      subtitle: persona.occupation,
                      meta: `${persona.city} · ${persona.age} · ${emotionEmoji(reaction.emotionalState)}`,
                      badge: stanceLabel(reaction.stance),
                      badgeClassName: `memory-stance memory-stance-${reaction.stance}`,
                    },
                  ]
                : [];
            })}
            selectedId={selectedReactionId}
            onToggle={(id) => setSelectedReactionId((currentId) => (currentId === id ? "" : id))}
          />
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
                  <p>{selectedReaction.perceivedPersonalImpact}</p>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {run ? (
        <section id="memory-divergence" className="memory-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Divergence report</div>
              <h2>How the panel splits</h2>
            </div>
          </div>
          <p>{run.aggregateReport?.executiveSummary}</p>
          <p>{run.aggregateReport?.overallPattern}</p>
          <ul>
            {run.aggregateReport?.mainDivergences.map((item) => (
              <li key={item.title}>
                <strong>{item.title}:</strong> {item.description}
              </li>
            ))}
          </ul>
          <p className="memory-warning">{run.aggregateReport?.caveats.join(" ")}</p>
        </section>
      ) : null}

      {run ? (
        <section id="memory-sources" className="memory-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Source provenance</div>
              <h2>Sources</h2>
            </div>
          </div>
          <div className="source-provenance-grid">
            {run.retrievedSources.map((source) => (
              <article key={source.id} className="source-row">
                <div className="source-row-topline">
                  <div>
                    <h3>{source.title}</h3>
                  </div>
                  <span className={`status-pill ${source.provenance === "live" ? "status-complete" : ""}`}>{source.provenance}</span>
                </div>
                <p>{source.snippet}</p>
              </article>
            ))}
          </div>
        </section>
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
                <span className="sr-only">Close context pack</span>
              </button>
            </div>
            <p>{selectedSegmentPack.memoryInjection.conciseBriefing}</p>
            <div className="inline-facts">
              <span><strong>Known:</strong> {selectedSegmentPack.memoryInjection.factsLikelyKnown.join(" | ")}</span>
              <span><strong>Ignored:</strong> {selectedSegmentPack.memoryInjection.factsLikelyIgnored.join(" | ")}</span>
              <span><strong>Practical:</strong> {selectedSegmentPack.memoryInjection.practicalImplications.join(" | ")}</span>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
