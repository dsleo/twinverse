import { Link } from "react-router-dom";
import { siteCopy } from "../config/siteCopy";
import { PipelineSection } from "../components/sections/PipelineSection";

export function MethodPage() {
  return (
    <div className="content-page">
      <section className="section-heading">
        <div>
          <div className="section-label">{siteCopy.method.label}</div>
          <h1>{siteCopy.method.title}</h1>
        </div>
        <p>{siteCopy.method.body}</p>
      </section>
      <PipelineSection />
      <section className="method-cta">
        <div>
          <div className="section-label">{siteCopy.method.nextLabel}</div>
          <h2>{siteCopy.method.nextTitle}</h2>
        </div>
        <Link to="/lab/opinion" className="accent-button">
          {siteCopy.method.nextCta}
        </Link>
      </section>
    </div>
  );
}
