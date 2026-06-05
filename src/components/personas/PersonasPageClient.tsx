"use client";

import { useEffect, useState } from "react";
import { PersonaCarousel } from "./PersonaCarousel";
import type { Persona } from "../../types";

export function PersonasPageClient({ personas }: { personas: Persona[] }) {
  const [selectedId, setSelectedId] = useState(personas[0]?.id ?? "");
  const selectedPersona = personas.find((persona) => persona.id === selectedId) ?? personas[0] ?? null;

  useEffect(() => {
    if (!selectedPersona) {
      setSelectedId("");
      return;
    }

    if (selectedPersona.id !== selectedId) {
      setSelectedId(selectedPersona.id);
    }
  }, [selectedId, selectedPersona]);

  return (
    <div className="personas-shell">
      <section className="personas-hero hero-copy">
        <div className="eyebrow">Personas</div>
        <h1>Meet the panel behind every simulation.</h1>
        <p className="hero-lede personas-lede">
          Each persona combines household reality, economic posture, and live concerns that shape how a message lands.
        </p>
      </section>

      <section className="personas-results">
        {personas.length === 0 ? (
          <div className="persona-detail-card personas-empty">
            <strong>No personas available.</strong>
          </div>
        ) : (
          <>
            <PersonaCarousel
              items={personas.map((persona) => ({
                id: persona.id,
                title: persona.name,
                subtitle: persona.occupation,
                meta: `${persona.city} · ${persona.age} · ${persona.region}`,
                badge: persona.concerns[0],
              }))}
              selectedId={selectedPersona?.id ?? ""}
              onToggle={setSelectedId}
            />

            {selectedPersona ? (
              <article className="persona-detail-card persona-detail-inline personas-detail">
                <div className="card-topline">
                  <span>{selectedPersona.region}</span>
                  <span className="persona-status-chip">{selectedPersona.household}</span>
                </div>
                <div className="personas-detail-head">
                  <div>
                    <h2>{selectedPersona.name}</h2>
                    <p>{selectedPersona.occupation}</p>
                  </div>
                  <div className="personas-detail-signal">
                    <strong>{selectedPersona.age}</strong>
                    <span>years old</span>
                  </div>
                </div>

                <div className="persona-detail-grid personas-detail-grid">
                  <div className="detail-group">
                    <label>City</label>
                    <p>{selectedPersona.city}</p>
                  </div>
                  <div className="detail-group">
                    <label>Household</label>
                    <p>{selectedPersona.household}</p>
                  </div>
                  <div className="detail-group">
                    <label>Economic posture</label>
                    <p>{selectedPersona.economicPosture}</p>
                  </div>
                </div>

                <div className="persona-response-list">
                  <div className="persona-response-row">
                    <strong>Region</strong>
                    <p>{selectedPersona.region}</p>
                  </div>
                  <div className="persona-response-row">
                    <strong>Traits</strong>
                    <p>{selectedPersona.traits.join(" · ")}</p>
                  </div>
                  <div className="persona-response-row">
                    <strong>Concerns</strong>
                    <p>{selectedPersona.concerns.join(" · ")}</p>
                  </div>
                </div>
              </article>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
