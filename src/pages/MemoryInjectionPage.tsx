import { useState, type FormEvent } from "react";
import { executeMemoryInjection, readStoredRuns, type MemoryInjectionRun, type InputType } from "../lib/memoryInjection";

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsRunning(true);
    setError(null);
    try {
      const nextRun = await executeMemoryInjection({ rawInput, inputType });
      setRun(nextRun);
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
          This flow is synthetic audience analysis, not a polling simulator. It shows how a prompt moves through population mapping,
          retrieval planning, context packs, reactions, and divergence.
        </p>
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
          />

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
              {examplePrompts.map((prompt) => (
                <button type="button" key={prompt} className="ghost-button" onClick={() => setRawInput(prompt)}>
                  Use example
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="memory-error">{error}</p> : null}
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
        <>
          <section className="memory-card">
            <h2>Population map</h2>
            {run.populationMap?.segments.map((segment) => (
              <article key={segment.id} className="sub-card">
                <h3>{segment.label}</h3>
                <p>{segment.description}</p>
                <p><strong>Concerns:</strong> {segment.likelyConcerns.join(", ")}</p>
                <p><strong>Information needs:</strong> {segment.informationNeeds.join(", ")}</p>
                <p><strong>Persona count:</strong> {segment.targetPersonaIds.length}</p>
              </article>
            ))}
          </section>

          <section className="memory-card">
            <h2>Retrieval plan</h2>
            {run.retrievalPlan?.queries.map((query, index) => (
              <article key={`${query.provider}-${index}`} className="sub-card">
                <p><strong>{query.provider}</strong> · {query.freshness}</p>
                <p>{query.query}</p>
                <p>{query.purpose}</p>
              </article>
            ))}
          </section>

          <section className="memory-card">
            <h2>Context packs</h2>
            {run.contextPacks.map((pack) => (
              <article key={pack.id} className="sub-card">
                <h3>{pack.label}</h3>
                <p>{pack.memoryInjection.conciseBriefing}</p>
                <p><strong>Facts likely known:</strong> {pack.memoryInjection.factsLikelyKnown.join(" | ")}</p>
                <p><strong>Facts likely ignored:</strong> {pack.memoryInjection.factsLikelyIgnored.join(" | ")}</p>
                <p><strong>Practical implications:</strong> {pack.memoryInjection.practicalImplications.join(" | ")}</p>
                <p><strong>Sources:</strong> {pack.sourceIds.join(", ")}</p>
              </article>
            ))}
          </section>

          <section className="memory-card">
            <h2>Reactions</h2>
            <div className="reaction-grid">
              {run.reactions.map((reaction) => (
                <article key={reaction.personaId} className="sub-card">
                  <p><strong>{reaction.personaId}</strong></p>
                  <p>{reaction.stance} · {reaction.emotionalState} · confidence {reaction.confidence}</p>
                  <p>{reaction.reactionSummary}</p>
                  <p>{reaction.quote}</p>
                  <p>{reaction.perceivedPersonalImpact}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="memory-card">
            <h2>Divergence report</h2>
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
          <article key={item.id} className="sub-card">
            <p><strong>{item.id}</strong></p>
            <p>{item.input.rawInput}</p>
            <p>{item.status}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
