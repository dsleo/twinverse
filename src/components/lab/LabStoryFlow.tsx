"use client";

import { useMemo, useState } from "react";
import type { PersistedLabRun } from "../../lib/labSchemas";

type StorySceneId = "question" | "split" | "mapping" | "merge" | "interviews" | "aggregation";

type StoryScene = {
  id: StorySceneId;
  kicker: string;
  title: string;
  body: string;
  takeaway: string;
  targetId: string;
};

const LAB_STORY_SCENES: StoryScene[] = [
  {
    id: "question",
    kicker: "01. Intake",
    title: "One question enters the lab",
    body: "The system starts from a single public question and prepares one orchestrated analysis pass.",
    takeaway: "Nothing is simulated yet. The prompt is the only object in play.",
    targetId: "lab-command",
  },
  {
    id: "split",
    kicker: "02. Parallel launch",
    title: "Two engines start at once",
    body: "The prompt immediately branches into audience segmentation and live information retrieval.",
    takeaway: "Population structure and evidence gathering run in parallel, not one after the other.",
    targetId: "lab-sources",
  },
  {
    id: "mapping",
    kicker: "03. Population mapping",
    title: "Personas are recruited into clusters",
    body: "Representative personas are sorted into distinct clusters so the system knows which publics matter for this question.",
    takeaway: "The model does not reason about a generic average citizen.",
    targetId: "lab-population",
  },
  {
    id: "merge",
    kicker: "04. Context packaging",
    title: "Clusters merge with retrieved information",
    body: "Evidence flows into each cluster to create one briefing package per audience segment.",
    takeaway: "Information becomes personalized context, not just a flat list of sources.",
    targetId: "lab-sources",
  },
  {
    id: "interviews",
    kicker: "05. Interview round",
    title: "Each cluster runs structured persona interviews",
    body: "Selected personas react inside their cluster lane using the package that was built for them.",
    takeaway: "These are grouped interview rounds, not isolated reactions.",
    targetId: "lab-reactions",
  },
  {
    id: "aggregation",
    kicker: "06. Synthesis",
    title: "The system aggregates all interviews into one reading",
    body: "Cluster-level splits, recurring drivers, and disagreement patterns are synthesized into a final report.",
    takeaway: "The top-line reading is computed from the interview outputs.",
    targetId: "lab-divergence",
  },
];

type LabStoryFlowProps = {
  run: PersistedLabRun;
  selectedSegmentId: string;
  onSelectSegment: (segmentId: string) => void;
  selectedReactionId: string;
  onSelectReaction: (reactionId: string) => void;
  onJumpToSection: (targetId: string) => void;
};

type SceneStatus = "pending" | "running" | "completed" | "failed";

function aggregateStatus(statuses: SceneStatus[]): SceneStatus {
  if (statuses.includes("failed")) {
    return "failed";
  }
  if (statuses.includes("running")) {
    return "running";
  }
  if (statuses.every((status) => status === "completed")) {
    return "completed";
  }
  return "pending";
}

function emotionEmoji(emotion: PersistedLabRun["reactions"][number]["emotionalState"]) {
  switch (emotion) {
    case "hopeful":
      return "HO";
    case "concerned":
      return "CO";
    case "skeptical":
      return "SK";
    case "angry":
      return "AN";
    case "calm":
      return "CA";
    default:
      return "UN";
  }
}

function stanceLabel(stance: PersistedLabRun["reactions"][number]["stance"]) {
  return stance.replaceAll("_", " ");
}

function stageSummary(step?: PersistedLabRun["steps"][number]) {
  return step?.summary ?? (step?.status === "completed" ? "Completed." : step?.status === "running" ? "Running." : "Waiting.");
}

function truncateText(value: string | undefined, maxLength: number) {
  if (!value) {
    return "";
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

export function LabStoryFlow({ run, selectedSegmentId, onSelectSegment, selectedReactionId, onSelectReaction, onJumpToSection }: LabStoryFlowProps) {
  const [activeSceneId, setActiveSceneId] = useState<StorySceneId>("question");

  const stepsById = useMemo(() => new Map(run.steps.map((step) => [step.id, step])), [run.steps]);

  const sceneStatuses = useMemo<Record<StorySceneId, SceneStatus>>(
    () => ({
      question: run.status === "failed" ? "failed" : run.status === "running" ? "running" : "completed",
      split: aggregateStatus([
        (stepsById.get("population_mapping")?.status ?? "pending") as SceneStatus,
        (stepsById.get("retrieval")?.status ?? "pending") as SceneStatus,
      ]),
      mapping: (stepsById.get("population_mapping")?.status ?? "pending") as SceneStatus,
      merge: aggregateStatus([
        (stepsById.get("retrieval")?.status ?? "pending") as SceneStatus,
        (stepsById.get("context_packs")?.status ?? "pending") as SceneStatus,
      ]),
      interviews: (stepsById.get("persona_reactions")?.status ?? "pending") as SceneStatus,
      aggregation: (stepsById.get("divergence_report")?.status ?? "pending") as SceneStatus,
    }),
    [run.status, stepsById],
  );

  const segments = run.populationMap?.segments ?? [];
  const selectedSegment = segments.find((segment) => segment.id === selectedSegmentId) ?? segments[0] ?? null;
  const selectedPack = run.contextPacks.find((pack) => pack.segmentId === selectedSegment?.id) ?? null;
  const sourceCards = run.retrieval?.sources.slice(0, 4) ?? [];
  const selectedSegmentPersonas =
    selectedSegment?.representativePersonaIds
      .map((personaId) => run.panel.find((persona) => persona.id === personaId))
      .filter((persona): persona is NonNullable<typeof persona> => Boolean(persona)) ?? [];

  const interviews = segments.map((segment) => {
    const reactions = run.reactions.filter((reaction) => reaction.segmentId === segment.id).slice(0, 2);
    return {
      segment,
      reactions: reactions.map((reaction) => ({
        reaction,
        persona: run.panel.find((persona) => persona.id === reaction.personaId) ?? null,
      })),
    };
  });

  const selectedInterview =
    run.reactions.find((reaction) => `${reaction.segmentId}-${reaction.personaId}` === selectedReactionId) ?? interviews.flatMap((entry) => entry.reactions.map((item) => item.reaction))[0] ?? null;

  const selectedInterviewPersona = selectedInterview ? run.panel.find((persona) => persona.id === selectedInterview.personaId) ?? null : null;
  const aggregationRows = run.aggregateReport?.perSegmentSummary ?? [];
  const branchPopulationStep = stepsById.get("population_mapping");
  const branchRetrievalStep = stepsById.get("retrieval");
  const activeScene = LAB_STORY_SCENES.find((scene) => scene.id === activeSceneId) ?? LAB_STORY_SCENES[0];
  const divergenceRows = run.aggregateReport?.mainDivergences ?? [];

  return (
    <section id="lab-story" className="lab-story-shell">
      <div className="section-heading section-heading-compact lab-story-heading">
        <div>
          <div className="section-label">Guided flow</div>
          <h2>How the lab builds a grounded audience reading</h2>
        </div>
      </div>

      <div className="lab-story-layout">
        <div className="lab-story-rail" aria-label="Guided flow stages">
          {LAB_STORY_SCENES.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={`lab-story-rail-item ${activeSceneId === scene.id ? "active" : ""}`}
              onClick={() => setActiveSceneId(scene.id)}
              aria-pressed={activeSceneId === scene.id}
            >
              <span className={`lab-story-rail-dot lab-story-status-${sceneStatuses[scene.id]}`} />
              <span>{scene.kicker}</span>
            </button>
          ))}
        </div>

        <div className="lab-story-canvas-column">
          <div className="lab-story-canvas-sticky">
            <div className="lab-story-canvas" data-scene={activeSceneId}>
              <div className="lab-story-orbit lab-story-orbit-a" />
              <div className="lab-story-orbit lab-story-orbit-b" />

              <section className="lab-scene-layer lab-scene-question">
                <div className="lab-scene-header">
                  <span className="lab-scene-caption">One question enters the lab</span>
                  <h3>{run.promptSnapshot}</h3>
                </div>
                <div className="lab-prompt-pulse" />
              </section>

              <section className="lab-scene-layer lab-scene-split">
                <div className="lab-split-node">
                  <span className="lab-branch-label">Cluster segmentation</span>
                  <strong>{branchPopulationStep?.label ?? "Population mapping"}</strong>
                  <p>{stageSummary(branchPopulationStep)}</p>
                </div>
                <div className="lab-split-node">
                  <span className="lab-branch-label">Information retrieval</span>
                  <strong>{branchRetrievalStep?.label ?? "Retrieval"}</strong>
                  <p>{stageSummary(branchRetrievalStep)}</p>
                </div>
                <div className="lab-split-rails" aria-hidden="true">
                  <span />
                  <span />
                </div>
              </section>

              <section className="lab-scene-layer lab-scene-mapping">
                <div className="lab-story-cluster-grid">
                  {segments.map((segment) => {
                    const isActive = selectedSegment?.id === segment.id;
                    return (
                      <button
                        key={segment.id}
                        type="button"
                        className={`lab-story-cluster-card ${isActive ? "active" : ""}`}
                        onMouseEnter={() => onSelectSegment(segment.id)}
                        onFocus={() => onSelectSegment(segment.id)}
                        onClick={() => onSelectSegment(segment.id)}
                      >
                        <div className="lab-story-cluster-topline">
                          <strong>{segment.label}</strong>
                          <span>{segment.memberPersonaIds.length}</span>
                        </div>
                        <p>{segment.summary}</p>
                        <div className="lab-story-chip-row">
                          {segment.representativePersonaIds.slice(0, 3).map((personaId) => {
                            const persona = run.panel.find((entry) => entry.id === personaId);
                            if (!persona) {
                              return null;
                            }
                            return (
                              <span key={persona.id} className="lab-story-persona-chip">
                                <b>{persona.name.slice(0, 1)}</b>
                                {persona.occupation}
                              </span>
                            );
                          })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="lab-scene-layer lab-scene-merge">
                <div className="lab-story-source-stack">
                  {sourceCards.map((source) => (
                    <article key={source.id} className="lab-story-source-card">
                      <span>{source.sourceName ?? source.provider}</span>
                      <strong>{source.title}</strong>
                    </article>
                  ))}
                </div>
                <div className="lab-story-pack-card">
                  <div className="lab-story-pack-topline">
                    <span className="lab-branch-label">Personalized package</span>
                    <strong>{selectedPack?.label ?? "Context pack pending"}</strong>
                  </div>
                  <p>{selectedPack?.conciseBriefing ?? "Retrieved evidence is merged into a segment-specific briefing package."}</p>
                  <div className="lab-story-chip-row">
                    {(selectedPack?.practicalImplications ?? selectedSegment?.concerns ?? []).slice(0, 3).map((item) => (
                      <span key={item} className="lab-story-mini-pill">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              <section className="lab-scene-layer lab-scene-interviews">
                <div className="lab-story-interview-stage">
                  <div className="lab-story-interview-board">
                    {interviews.map(({ segment, reactions }) => (
                      <button
                        key={segment.id}
                        type="button"
                        className={`lab-story-interview-column ${selectedInterview?.segmentId === segment.id ? "active" : ""}`}
                        onClick={() => {
                          const firstReaction = reactions[0]?.reaction;
                          if (firstReaction) {
                            onSelectReaction(`${firstReaction.segmentId}-${firstReaction.personaId}`);
                          }
                        }}
                      >
                        <div className="lab-story-column-header">
                          <strong>{segment.label}</strong>
                          <span>{reactions.length} voices</span>
                        </div>
                        <div className="lab-story-interview-summary">
                          {reactions.map(({ reaction, persona }) => {
                            if (!persona) {
                              return null;
                            }
                            return (
                              <span key={reaction.personaId} className="lab-story-mini-pill">
                                {persona.name} · {stanceLabel(reaction.stance)}
                              </span>
                            );
                          })}
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedInterview && selectedInterviewPersona ? (
                    <article className="lab-story-interview-focus">
                      <div className="lab-story-interview-topline">
                        <div>
                          <span className="lab-branch-label">Selected interview</span>
                          <strong>{selectedInterviewPersona.name}</strong>
                        </div>
                        <span className={`lab-stance lab-stance-${selectedInterview.stance}`}>{stanceLabel(selectedInterview.stance)}</span>
                      </div>
                      <p>{truncateText(selectedInterview.reactionSummary, 170)}</p>
                      <div className="lab-story-chip-row">
                        {selectedInterview.keyDrivers.slice(0, 3).map((driver) => (
                          <span key={driver} className="lab-story-mini-pill">
                            {driver}
                          </span>
                        ))}
                      </div>
                    </article>
                  ) : null}
                </div>
              </section>

              <section className="lab-scene-layer lab-scene-aggregation">
                <div className="lab-story-aggregation-panel">
                  <div className="lab-story-aggregation-summary">
                    <span className="lab-branch-label">Synthesis</span>
                    <strong>{truncateText(run.aggregateReport?.executiveSummary, 96) || "Aggregation pending."}</strong>
                    <p>{truncateText(run.aggregateReport?.overallPattern, 120) || "Interview outputs are combined into one final reading."}</p>
                  </div>
                  <div className="lab-story-signal-grid">
                    {aggregationRows.map((row) => (
                      <article key={row.segmentId} className="lab-story-signal-card">
                        <strong>{row.label}</strong>
                        <span>{row.dominantStance}</span>
                        <p>{truncateText(row.emotionalTone, 42)}</p>
                      </article>
                    ))}
                  </div>
                  {divergenceRows.length ? (
                    <div className="lab-story-divergence-list" aria-label="Main divergences">
                      {divergenceRows.map((item) => (
                        <span key={item.title} className="lab-story-mini-pill">
                          {item.title}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </div>

        <aside className="lab-story-panel active">
          <span className={`lab-story-panel-status lab-story-status-${sceneStatuses[activeScene.id]}`} />
          <div className="lab-story-panel-copy">
            <div className="lab-story-panel-head">
              <div>
                <div className="lab-story-panel-kicker">{activeScene.kicker}</div>
                <h3>{activeScene.title}</h3>
              </div>
              <button type="button" className="icon-button lab-story-inspect-icon" onClick={() => onJumpToSection(activeScene.targetId)} aria-label="Inspect this stage">
                <span aria-hidden="true">⌕</span>
              </button>
            </div>
            <p>{activeScene.body}</p>
            <strong>{activeScene.takeaway}</strong>
            {activeScene.id === "mapping" && selectedSegment ? (
              <div className="lab-story-panel-facts">
                <span>{selectedSegment.memberPersonaIds.length} mapped personas</span>
                <span>{selectedSegment.concerns.slice(0, 2).join(" / ")}</span>
                {selectedSegmentPersonas[0] ? <span>{selectedSegmentPersonas[0].name} anchors the cluster view</span> : null}
              </div>
            ) : null}
            {activeScene.id === "merge" && selectedPack ? (
              <div className="lab-story-panel-facts">
                <span>{selectedPack.supportingSourceIds.length} linked sources</span>
                <span>{selectedPack.emotionalPrimers.slice(0, 2).join(" / ")}</span>
              </div>
            ) : null}
            {activeScene.id === "interviews" && selectedInterview && selectedInterviewPersona ? (
              <div className="lab-story-panel-facts">
                <span>{selectedInterviewPersona.name}</span>
                <span>{selectedInterviewPersona.occupation}</span>
                <span>{stanceLabel(selectedInterview.stance)}</span>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
