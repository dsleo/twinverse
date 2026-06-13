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
    kicker: "01. Question",
    title: "The question sets direction",
    body: "Everything starts from the issue being explored and the reaction we want to understand.",
    takeaway: "This is the starting point for the reading.",
    targetId: "lab-command",
  },
  {
    id: "split",
    kicker: "02. Audience + context",
    title: "Audience and context take shape",
    body: "The lab prepares the audience view and the surrounding context at the same time.",
    takeaway: "Both views are built side by side.",
    targetId: "lab-sources",
  },
  {
    id: "mapping",
    kicker: "03. Audience groups",
    title: "Different publics come into view",
    body: "The reading is organized around distinct audience groups from the start.",
    takeaway: "This is not one average reaction.",
    targetId: "lab-population",
  },
  {
    id: "merge",
    kicker: "04. Tailored context",
    title: "Each group gets the right context",
    body: "Relevant information is matched to each group before reactions are formed.",
    takeaway: "The same question lands differently by audience.",
    targetId: "lab-sources",
  },
  {
    id: "interviews",
    kicker: "05. Reactions",
    title: "Different voices respond",
    body: "The lab reveals what resonates, what worries people, and where views diverge.",
    takeaway: "Distinct reactions become visible here.",
    targetId: "lab-reactions",
  },
  {
    id: "aggregation",
    kicker: "06. Synthesis",
    title: "A shared reading emerges",
    body: "The group responses are brought together into one clear overall reading.",
    takeaway: "The final view is built from all responses.",
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
  return step?.status === "completed" ? "Complete." : step?.status === "running" ? "In progress." : "Waiting.";
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
  const branchPopulationStep = stepsById.get("population_mapping");
  const branchRetrievalStep = stepsById.get("retrieval");
  const activeScene = LAB_STORY_SCENES.find((scene) => scene.id === activeSceneId) ?? LAB_STORY_SCENES[0];
  const interviewQuotes = run.reactions
    .map((reaction) => ({
      reaction,
      persona: run.panel.find((persona) => persona.id === reaction.personaId) ?? null,
    }))
    .filter((entry): entry is { reaction: PersistedLabRun["reactions"][number]; persona: NonNullable<PersistedLabRun["panel"][number]> } => Boolean(entry.persona))
    .slice(0, 3);

  return (
    <section id="lab-story" className="lab-story-shell">
      <div className="section-heading section-heading-compact lab-story-heading">
        <div>
          <div className="section-label">Guided flow</div>
          <h2>How the reading comes together</h2>
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
                  <span className="lab-scene-caption">Question being explored</span>
                  <h3>{run.promptSnapshot}</h3>
                </div>
                <div className="lab-prompt-pulse" />
              </section>

              <section className="lab-scene-layer lab-scene-split">
                <div className="lab-split-node">
                  <span className="lab-branch-label">Audience groups</span>
                  <strong>Audience groups</strong>
                  <p>{stageSummary(branchPopulationStep)}</p>
                </div>
                <div className="lab-split-node">
                  <span className="lab-branch-label">Relevant context</span>
                  <strong>Relevant context</strong>
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
                        <strong>{segment.label}</strong>
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
                    <span className="lab-branch-label">Group briefing</span>
                    <strong>{selectedPack?.label ?? "Briefing in preparation"}</strong>
                  </div>
                  <p>{truncateText(selectedPack?.conciseBriefing, 96) || "Relevant context is assembled into a briefing for this audience group."}</p>
                  <div className="lab-story-chip-row">
                    {(selectedPack?.practicalImplications ?? selectedSegment?.concerns ?? []).slice(0, 2).map((item) => (
                      <span key={item} className="lab-story-mini-pill">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              <section className="lab-scene-layer lab-scene-interviews">
                <div className="lab-story-interview-stage">
                  <div className="lab-story-quote-board">
                    {interviewQuotes.map(({ reaction, persona }) => (
                      <button
                        key={`${reaction.segmentId}-${reaction.personaId}`}
                        type="button"
                        className={`lab-story-quote-card ${selectedReactionId === `${reaction.segmentId}-${reaction.personaId}` ? "active" : ""}`}
                        onClick={() => onSelectReaction(`${reaction.segmentId}-${reaction.personaId}`)}
                      >
                        <div className="lab-story-quote-head">
                          <strong>{persona.name}</strong>
                          <span>{persona.occupation}</span>
                        </div>
                        <p>"{truncateText(reaction.reactionSummary, 96)}"</p>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="lab-scene-layer lab-scene-aggregation">
                <div className="lab-story-aggregation-mark">
                  <div className="lab-story-aggregation-summary">
                    <span className="lab-branch-label">Combined reading</span>
                    <strong>{truncateText(run.aggregateReport?.executiveSummary, 96) || "Synthesis in preparation."}</strong>
                    <p>{truncateText(run.aggregateReport?.overallPattern, 104) || "The full reading is formed by combining responses across groups."}</p>
                  </div>
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
                <span>{selectedSegment.memberPersonaIds.length} people represented</span>
                <span>{selectedSegment.concerns.slice(0, 2).join(" / ")}</span>
                {selectedSegmentPersonas[0] ? <span>{selectedSegmentPersonas[0].name} is an example voice in this group</span> : null}
              </div>
            ) : null}
            {activeScene.id === "merge" && selectedPack ? (
              <div className="lab-story-panel-facts">
                <span>{selectedPack.supportingSourceIds.length} supporting sources</span>
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
