import type { SourceReference } from "../../types";

const publisherLogos: Record<string, { src: string; className?: string }> = {
  "Commission des sondages": {
    src: "/logos/commission-des-sondages.gif",
    className: "source-logo-commission",
  },
  CEVIPOF: {
    src: "/logos/sciencespo-cevipof.svg",
    className: "source-logo-sciencespo",
  },
  INSEE: {
    src: "/logos/insee.png",
    className: "source-logo-insee",
  },
  "Banque de France": {
    src: "/logos/banque-de-france.svg",
    className: "source-logo-bdf",
  },
  "Arcep / CREDOC": {
    src: "/logos/arcep.svg",
    className: "source-logo-arcep",
  },
  "France Num": {
    src: "/logos/france-num.svg",
    className: "source-logo-francenum",
  },
  "Le Monde": {
    src: "/logos/le-monde.ico",
    className: "source-logo-lemonde",
  },
};

export function SourceSignalStrip({ sources }: { sources: SourceReference[] }) {
  const logoItems = sources
    .map((source) => {
      const logo = publisherLogos[source.publisher];
      if (!logo) {
        return null;
      }

      return {
        id: source.id,
        publisher: source.publisher,
        url: source.url,
        ...logo,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <section className="source-strip" aria-label="Source logos">
      <div className="source-strip-track" role="list">
        {[...logoItems, ...logoItems].map((item, index) => (
          <a
            key={`${item.id}-${index}`}
            className="source-strip-item"
            href={item.url}
            target="_blank"
            rel="noreferrer"
            aria-label={item.publisher}
            role="listitem"
          >
            <img className={`source-strip-logo ${item.className ?? ""}`} src={item.src} alt={item.publisher} loading="lazy" />
          </a>
        ))}
      </div>
    </section>
  );
}
