import type { SourceReference } from "../../types";

export function HeadlineSection({
  kicker,
  title,
  strap,
  source,
}: {
  kicker: string;
  title: string;
  strap: string;
  source: SourceReference | null;
}) {
  return (
    <section className="hero-grid hero-grid-single lab-demo-hero">
      <div className="hero-copy">
        <div className="eyebrow">{kicker}</div>
        <h1>{title}</h1>
        <p className="hero-lede">{strap}</p>
        {source ? (
          <a className="source-reference" href={source.url} target="_blank" rel="noreferrer">
            Survey reference: {source.publisher} / {source.publishedAt}
          </a>
        ) : null}
      </div>
    </section>
  );
}
