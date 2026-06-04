import { useState, type FormEvent } from "react";
import { executeMemoryInjection, getStoredRun, readStoredRuns, type MemoryInjectionRun, type InputType } from "../lib/memoryInjection";

const examplePrompts = [
  "Faut-il construire de nouvelles centrales nucléaires en France ?",
  "Faut-il encadrer davantage les loyers dans les grandes villes ?",
  "Le gouvernement devrait-il lancer un plan national pour les transports régionaux ?",
];

const inputTypes: InputType[] = ["question", "article", "proposal", "speech", "poll_question", "other"];

export function MemoryInjectionPage() {
  const [rawInput, setRawInput] = useState(examplePrompts[0]);
  const [inputType, setInputType] = useState<InputType>("question");
  const [run, setRun] = useState<MemoryInjectionRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MemoryInjectionRun[]>(() => readStoredRuns());
  const [openReactionIds, setOpenReactionIds] = useState<string[]>([]);
  const activeRunId = run?.id ?? null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsRunning(true);
    setError(null);
    try {
      const nextRun = await executeMemoryInjection({ rawInput, inputType });
      setRun(nextRun);
      setOpenReactionIds([]);
      setHistory(readStoredRuns());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to run the pipeline.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="memory-page">
      <section className="memory-hero">
        <div className="eyebrow">Personalized Memory Injection</div>
        <h1>Build context packs before you simulate reactions.</h1>
        <p className="hero-lede">
          This is synthetic audience analysis, not a polling simulator. Paste a question, article, proposal, speech, or poll prompt,
          and the engine will map audiences, retrieve sources, build context packs, simulate reactions, and explain divergence.
        </p>
        <div className="memory-hero-note">
          <strong>Best for:</strong> strategy teams, public affairs, and product leaders who need a fast read on how different French
          audiences may react.
        </div>
      </section>

      <section className="memory-card">
        <form onSubmit={handleSubmit} className="memory-form">
          <label className="memory-label" htmlFor="memory-input">
            Prompt
          </label>
          <textarea
            id="memory-input"
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            minLength={10}
            rows={6}
            aria-describedby="memory-input-help memory-input-error"
            aria-invalid={Boolean(error)}
            placeholder="Paste a question, article, proposal, speech, or poll prompt"
          />
          <p id="memory-input-help" className="memory-help">
            Minimum 10 characters. Longer prompts produce better population mapping and retrieval.
          </p>

          <div className="memory-grid">
            <label className="memory-label" htmlFor="memory-type">
              Input type
            </label>
            <select id="memory-type" value={inputType} onChange={(event) => setInputType(event.target.value as InputType)}>
              {inputTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="hero-actions">
            <button type="submit" className="accent-button" disabled={isRunning}>
              {isRunning ? "Running..." : "Run pipeline"}
            </button>
            <div className="example-prompts">
              {examplePrompts.map((prompt, index) => (
                <button
                  type="button"
                  key={prompt}
                  className="ghost-button"
                  onClick={() => setRawInput(prompt)}
                  aria-label={`Use example: ${prompt}`}
                >
                  Example {index + 1}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p id="memory-input-error" className="memory-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </section>

      <section className="memory-card">
        <h2>Pipeline status</h2>
        <ol className="pipeline-list">
          <li>Input received</li>
          <li>Population mapped</li>
          <li>Retrieval planned</li>
          <li>Sources retrieved</li>
          <li>Context packs built</li>
          <li>Reactions simulated</li>
          <li>Divergence explained</li>
        </ol>
      </section>

      {run ? (
        <section className="memory-card">
          <div className="section-heading section-heading-compact">
            <div>
              <div className="section-label">Source provenance</div>
              <h2>Live vs fallback</h2>
            </div>
            <p>Each retrieved item shows whether it came from a live fetch or a fallback source.</p>
          </div>
          <div className="source-provenance-grid">
            {run.retrievedSources.map((source) => (
              <article key={source.id} className="sub-card">
                <p><strong>{source.title}</strong></p>
                <p>{source.provider} · {source.provenance}</p>
                <p>{source.sourceName ?? "Unknown source"}</p>
                <p>{source.snippet}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {run ? (
        <>
          <section className="memory-card">
            <div className="section-heading section-heading-compact">
              <div>
                <div className="section-label">Population map</div>
                <h2>Five audience clusters</h2>
              </div>
              <p>The panel is partitioned into distinct audience groups so the same prompt can produce different context packs.</p>
            </div>
            <div className="population-grid">
              {run.populationMap?.segments.map((segment) => (
                <article key={segment.id} className="sub-card population-card">
                  <div className="card-topline">
                    <h3>{segment.label}</h3>
                    <span>{segment.targetPersonaIds.length} personas</span>
                  </div>
                  <p>{segment.description}</p>
                  <p><strong>Concerns:</strong> {segment.likelyConcerns.join(", ")}</p>
                  <p><strong>Information needs:</strong> {segment.informationNeeds.join(", ")}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="memory-card">
            <div className="section-heading section-heading-compact">
              <div>
                <div className="section-label">Retrieval plan</div>
                <h2>What the engine looked for</h2>
              </div>
              <p>The planner mixes background context, recent coverage, and discourse signals to frame the prompt.</p>
            </div>
            <div className="plan-list">
              {run.retrievalPlan?.queries.map((query, index) => (
                <article key={`${query.provider}-${index}`} className="plan-row">
                  <div className="plan-meta">
                    <strong>{query.provider}</strong>
                    <span>{query.freshness}</span>
                  </div>
                  <div>
                    <p>{query.query}</p>
                    <p>{query.purpose}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="memory-card">
            <div className="section-heading section-heading-compact">
              <div>
                <div className="section-label">Context packs</div>
                <h2>Memory injection by audience</h2>
              </div>
              <p>Each pack compresses what a segment is likely to know, ignore, and emotionally notice.</p>
            </div>
            <div className="context-pack-grid">
              {run.contextPacks.map((pack) => (
                <article key={pack.id} className="sub-card context-pack-card">
                  <div className="card-topline">
                    <h3>{pack.label}</h3>
                    <span>{pack.targetPersonaIds.length} personas</span>
                  </div>
                  <p>{pack.memoryInjection.conciseBriefing}</p>
                  <p><strong>Known:</strong> {pack.memoryInjection.factsLikelyKnown.join(" | ")}</p>
                  <p><strong>Ignored:</strong> {pack.memoryInjection.factsLikelyIgnored.join(" | ")}</p>
                  <p><strong>Practical:</strong> {pack.memoryInjection.practicalImplications.join(" | ")}</p>
                  <p><strong>Sources:</strong> {pack.sourceIds.join(", ")}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="memory-card">
            <div className="section-heading section-heading-compact">
              <div>
                <div className="section-label">Reactions</div>
                <h2>Synthetic responses</h2>
              </div>
              <p>{run.reactions.length} synthetic reactions generated from the dataset-backed panel.</p>
            </div>
            <div className="reaction-toolbar">
              <button type="button" className="ghost-button" onClick={() => setOpenReactionIds(run.reactions.map((reaction) => reaction.personaId))}>
                Expand all
              </button>
              <button type="button" className="ghost-button" onClick={() => setOpenReactionIds([])}>
                Collapse all
              </button>
            </div>
            <div className="reaction-grid">
              {run.reactions.map((reaction) => {
                const isOpen = openReactionIds.includes(reaction.personaId);
                return (
                  <details
                    key={reaction.personaId}
                    className="sub-card reaction-card"
                    open={isOpen}
                    onToggle={(event) => {
                      const nextOpen = event.currentTarget.open;
                      setOpenReactionIds((current) =>
                        nextOpen ? [...current, reaction.personaId] : current.filter((id) => id !== reaction.personaId),
                      );
                    }}
                  >
                    <summary>
                      <strong>{reaction.personaId}</strong> · {reaction.stance} · {reaction.emotionalState} · confidence {reaction.confidence}
                    </summary>
                    <p>{reaction.reactionSummary}</p>
                    <p>{reaction.quote}</p>
                    <p>{reaction.perceivedPersonalImpact}</p>
                  </details>
                );
              })}
            </div>
          </section>

          <section className="memory-card">
            <div className="section-heading section-heading-compact">
              <div>
                <div className="section-label">Divergence report</div>
                <h2>How the panel splits</h2>
              </div>
              <p>Use this to compare the main fault lines rather than reading the reactions one by one.</p>
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
            <ul>
              {run.aggregateReport?.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <section className="memory-card">
        <h2>Run history</h2>
        {history.length === 0 ? <p>No runs stored yet.</p> : null}
        {history.slice(0, 5).map((item) => (
          <button
            key={item.id}
            type="button"
            className="sub-card history-card"
            aria-pressed={activeRunId === item.id}
            onClick={() => {
              const stored = getStoredRun(item.id);
              if (stored) {
                setRun(stored);
              }
            }}
          >
            <div className="history-card-topline">
              <strong>{item.id}</strong>
              <span>{item.status}</span>
            </div>
            <p>{item.input.rawInput}</p>
          </button>
        ))}
      </section>
    </div>
  );
}
