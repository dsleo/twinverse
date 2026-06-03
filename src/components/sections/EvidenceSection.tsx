import { ScanSearch } from "lucide-react";
import { siteCopy } from "../../config/siteCopy";
import { getSourceReferences, listCompetitorFacts } from "../../lib/contentRepository";
import { formatToken, sourceKindLabel } from "../../lib/formatters";
import type { DemoKind, ScenarioPacket, SourceReference } from "../../types";

function CitationLink({ source }: { source: SourceReference }) {
  return (
    <a className="citation-link" href={source.url} target="_blank" rel="noreferrer">
      <span>{source.publisher}</span>
      <time dateTime={source.publishedAt}>{source.publishedAt}</time>
    </a>
  );
}

export function EvidenceSection({
  activeDemo,
  packet,
}: {
  activeDemo: DemoKind;
  packet: ScenarioPacket;
}) {
  const competitorFacts = listCompetitorFacts(activeDemo);

  return (
    <section className="evidence-section">
      <div className="section-heading">
        <div>
          <div className="section-label">{siteCopy.evidence.sectionLabel}</div>
          <h2>{siteCopy.evidence.sectionTitle}</h2>
        </div>
      </div>
      <div className="evidence-grid">
        <div className="evidence-column">
          {packet.sources.map((source) => (
            <article key={source.id} className="source-card">
              <div className="source-header">
                <span>{sourceKindLabel[source.kind]}</span>
                <CitationLink source={source} />
              </div>
              <h3>{source.title}</h3>
              <p>{source.summary}</p>
              <div className="tag-row">
                {source.tags.map((tag) => (
                  <span key={tag}>{formatToken(tag)}</span>
                ))}
              </div>
              <a href={source.url} target="_blank" rel="noreferrer">
                {siteCopy.evidence.openSource}
              </a>
            </article>
          ))}
        </div>
        {competitorFacts.length > 0 ? (
          <div className="evidence-side">
            <section className="evidence-note-group">
              <div className="card-topline">
                <span>{siteCopy.evidence.competitorRead}</span>
                <ScanSearch size={16} />
              </div>
              {competitorFacts.map((fact) => (
                <div key={fact.id} className="brief-item">
                  <strong>{fact.category}</strong>
                  <p>{fact.insight}</p>
                  <div className="citation-row">
                    {getSourceReferences(fact.sourceIds).map((source) => (
                      <CitationLink key={source.id} source={source} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </div>
        ) : null}
      </div>
    </section>
  );
}
