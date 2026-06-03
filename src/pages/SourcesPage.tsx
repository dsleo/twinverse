import { SourceBrandStrip } from "../components/branding/SourceBrandStrip";
import { siteCopy } from "../config/siteCopy";

export function SourcesPage() {
  return (
    <div className="content-page">
      <section className="section-heading">
        <div>
          <div className="section-label">{siteCopy.sources.label}</div>
          <h1>{siteCopy.sources.title}</h1>
        </div>
        <p>{siteCopy.sources.body}</p>
      </section>
      <SourceBrandStrip />
    </div>
  );
}
