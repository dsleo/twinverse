import { getPersona } from "../../lib/contentRepository";
import { useEffect, useState } from "react";
import { siteCopy } from "../../config/siteCopy";
import type { PersonaResponse } from "../../types";

export function PersonaSection({ responses }: { responses: PersonaResponse[] }) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");

  useEffect(() => {
    setSelectedPersonaId("");
  }, [responses]);

  return (
    <section className="persona-section">
      <div className="section-heading">
        <div>
          <div className="section-label">{siteCopy.personas.sectionLabel}</div>
          <h2>{siteCopy.personas.sectionTitle}</h2>
        </div>
      </div>
      <div className="persona-carousel" role="list">
        {responses.map((response) => {
          const persona = getPersona(response.personaId);
          const isActive = selectedPersonaId === response.personaId;
          return (
            <article
              key={response.personaId}
              className={`persona-list-card persona-carousel-card ${isActive ? "active" : ""}`}
              role="listitem"
            >
              <button
                className="persona-button persona-card-toggle"
                onClick={() => setSelectedPersonaId((currentId) => (currentId === response.personaId ? "" : response.personaId))}
                aria-expanded={isActive}
                aria-pressed={isActive}
              >
                <div className="persona-meta">
                  <strong>{persona.name}</strong>
                </div>
                <p className="persona-role">{persona.occupation}</p>
              </button>
            </article>
          );
        })}
      </div>
      {responses.map((response) => {
        if (response.personaId !== selectedPersonaId) {
          return null;
        }

        const persona = getPersona(response.personaId);

        return (
          <div key={response.personaId} className="persona-detail-card persona-detail-inline">
            <div className="persona-detail-grid">
              <div className="detail-group">
                <label>{siteCopy.personas.locationLabel}</label>
                <p>{persona.city}</p>
              </div>
              <div className="detail-group">
                <label>{siteCopy.personas.ageLabel}</label>
                <p>
                  {persona.age} {siteCopy.personas.yearsOldLabel}
                </p>
              </div>
              <div className="detail-group">
                <label>{siteCopy.personas.householdLabel}</label>
                <p>{persona.household}</p>
              </div>
              <div className="detail-group">
                <label>{siteCopy.personas.economicPostureLabel}</label>
                <p>{persona.economicPosture}</p>
              </div>
              <div className="detail-group detail-group-wide">
                <label>{siteCopy.personas.coreConcernsLabel}</label>
                <p>{persona.concerns.join(" / ")}</p>
              </div>
            </div>

            <div className="persona-response-list">
              <div className="persona-response-row">
                <label>{siteCopy.personas.baselineLabel}</label>
                <p>{response.baselinePreference}</p>
              </div>
              <div className="persona-response-row">
                <label>{siteCopy.personas.eventsLabel}</label>
                <p>{response.effectOfRecentEvents}</p>
              </div>
              <div className="persona-response-row">
                <label>{siteCopy.personas.answerLabel}</label>
                <p>{response.finalAnswer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
