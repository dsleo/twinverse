import type { SourceReference } from "../../types";

export function SourceSignalStrip({ sources }: { sources: SourceReference[] }) {
  return (
    <section className="source-strip" aria-label="Current signal sources">
      <div className="source-strip-track">
        {[...sources, ...sources].map((source, index) => (
          <a
            key={`${source.id}-${index}`}
            className="source-strip-item"
            href={source.url}
            target="_blank"
            rel="noreferrer"
            aria-label={source.title}
          >
            <span className="source-strip-copy">
              <strong>{source.title}</strong>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
