import { getPersona } from "../../lib/contentRepository";
import { PersonaCarousel } from "../personas/PersonaCarousel";
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
      <PersonaCarousel
        items={responses.map((response) => {
          const persona = getPersona(response.personaId);
          return {
            id: response.personaId,
            title: persona.name,
            subtitle: persona.occupation,
          };
        })}
        selectedId={selectedPersonaId}
        onToggle={(id) => setSelectedPersonaId((currentId) => (currentId === id ? "" : id))}
      />
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
