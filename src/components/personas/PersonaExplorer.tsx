import { useDeferredValue, useMemo, useState } from "react";
import { listPersonas } from "../../lib/contentRepository";
import { siteCopy } from "../../config/siteCopy";
import type { Persona } from "../../types";

function matchesQuery(persona: Persona, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    persona.name,
    persona.city,
    persona.region,
    persona.occupation,
    persona.household,
    persona.economicPosture,
    ...persona.traits,
    ...persona.concerns,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export function PersonaExplorer() {
  const personas = listPersonas();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [selectedPersonaId, setSelectedPersonaId] = useState(personas[0]?.id ?? "");
  const deferredQuery = useDeferredValue(query);

  const regions = useMemo(
    () => ["all", ...Array.from(new Set(personas.map((persona) => persona.region)))],
    [personas],
  );

  const filtered = useMemo(
    () =>
      personas.filter((persona) => {
        const regionMatch = region === "all" || persona.region === region;
        return regionMatch && matchesQuery(persona, deferredQuery);
      }),
    [deferredQuery, personas, region],
  );

  const selectedPersona = filtered.find((persona) => persona.id === selectedPersonaId) ?? filtered[0] ?? personas[0];

  return (
    <section className="persona-explorer">
      <div className="explorer-controls">
        <input
          aria-label={siteCopy.personas.searchLabel}
          className="search-input"
          placeholder={siteCopy.personas.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label={siteCopy.personas.regionLabel}
          className="select-input"
          value={region}
          onChange={(event) => setRegion(event.target.value)}
        >
          {regions.map((entry) => (
            <option key={entry} value={entry}>
              {entry === "all" ? siteCopy.personas.allRegions : entry}
            </option>
          ))}
        </select>
      </div>
      <div className="explorer-list">
        {filtered.map((persona) => {
          const isActive = selectedPersona?.id === persona.id;

          return (
            <div key={persona.id} className="explorer-item">
              <button
                className={`persona-list-card ${isActive ? "active" : ""}`}
                onClick={() => setSelectedPersonaId(persona.id)}
                aria-expanded={isActive}
              >
                <strong>{persona.name}</strong>
                <span>
                  {persona.occupation} / {persona.city}
                </span>
                <small>{persona.concerns.join(" · ")}</small>
              </button>
              {isActive ? (
                <article className="persona-detail-card persona-detail-inline">
                  <div className="persona-meta">
                    <strong>{persona.name}</strong>
                    <span>
                      {persona.age} / {persona.city}
                    </span>
                  </div>
                  <p className="persona-role">{persona.occupation}</p>
                  <div className="detail-group">
                    <label>Region</label>
                    <p>{persona.region}</p>
                  </div>
                  <div className="detail-group">
                    <label>{siteCopy.personas.householdLabel}</label>
                    <p>{persona.household}</p>
                  </div>
                  <div className="detail-group">
                    <label>{siteCopy.personas.economicPostureLabel}</label>
                    <p>{persona.economicPosture}</p>
                  </div>
                  <div className="detail-group">
                    <label>{siteCopy.personas.traitsLabel}</label>
                    <div className="tag-row">
                      {persona.traits.map((trait) => (
                        <span key={trait}>{trait}</span>
                      ))}
                    </div>
                  </div>
                  <div className="detail-group">
                    <label>{siteCopy.personas.concernsLabel}</label>
                    <div className="tag-row">
                      {persona.concerns.map((concern) => (
                        <span key={concern}>{concern}</span>
                      ))}
                    </div>
                  </div>
                </article>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
