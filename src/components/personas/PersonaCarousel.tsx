export interface PersonaCarouselItem {
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  badge?: string;
  badgeClassName?: string;
}

interface PersonaCarouselProps {
  items: PersonaCarouselItem[];
  selectedId: string;
  onToggle: (id: string) => void;
}

export function PersonaCarousel({ items, selectedId, onToggle }: PersonaCarouselProps) {
  return (
    <div className="persona-carousel" role="list">
      {items.map((item) => {
        const isActive = selectedId === item.id;
        return (
          <article key={item.id} className={`persona-list-card persona-carousel-card ${isActive ? "active" : ""}`} role="listitem">
            <button
              className="persona-button persona-card-toggle"
              onClick={() => onToggle(item.id)}
              aria-expanded={isActive}
              aria-pressed={isActive}
            >
              <div className="persona-meta">
                <strong>{item.title}</strong>
                {item.badge ? <span className={item.badgeClassName}>{item.badge}</span> : null}
              </div>
              <p className="persona-role">{item.subtitle}</p>
              {item.meta ? <p className="memory-persona-meta">{item.meta}</p> : null}
            </button>
          </article>
        );
      })}
    </div>
  );
}
