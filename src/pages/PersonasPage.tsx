import { PersonaExplorer } from "../components/personas/PersonaExplorer";
import { siteCopy } from "../config/siteCopy";

export function PersonasPage() {
  return (
    <div className="content-page">
      <section className="section-heading">
        <div>
          <div className="section-label">{siteCopy.personas.pageLabel}</div>
          <h1>{siteCopy.personas.pageTitle}</h1>
        </div>
      </section>
      <PersonaExplorer />
    </div>
  );
}
