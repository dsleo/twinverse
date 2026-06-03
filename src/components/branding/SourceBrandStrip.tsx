import { listSourceReferences } from "../../lib/contentRepository";

function getPublisherMark(publisher: string) {
  return publisher
    .split(/[ /-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function SourceBrandStrip() {
  const publishers = Array.from(new Set(listSourceReferences().map((source) => source.publisher)));
  const track = [...publishers, ...publishers];

  return (
    <section className="brand-strip" aria-label="Source signals">
      <div className="brand-carousel">
        <div className="brand-track">
          {track.map((publisher, index) => (
            <div
              key={`${publisher}-${index}`}
              className="brand-chip"
              title={publisher}
              aria-label={publisher}
            >
              <span className="brand-chip-mark">{getPublisherMark(publisher)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
