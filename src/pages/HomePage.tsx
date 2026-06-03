import { Link } from "react-router-dom";
import { SourceBrandStrip } from "../components/branding/SourceBrandStrip";
import { DemoTabs } from "../components/sections/DemoTabs";
import { siteCopy } from "../config/siteCopy";

export function HomePage() {
  return (
    <div className="home-stack">
      <section className="home-hero">
        <div className="eyebrow">{siteCopy.home.eyebrow}</div>
        <h1>{siteCopy.home.title}</h1>
        <p className="hero-lede">{siteCopy.home.lede}</p>
        <div className="hero-actions">
          <a href="#home-lab-picker" className="accent-button">
            {siteCopy.home.primaryCta}
          </a>
          <Link to="/personas" className="ghost-button">
            {siteCopy.home.secondaryCta}
          </Link>
          <Link to="/memory" className="ghost-button">
            Memory injection
          </Link>
        </div>
      </section>

      <SourceBrandStrip />

      <section className="home-explainer">
        <div className="section-label">{siteCopy.home.explainerLabel}</div>
        <h2>{siteCopy.home.explainerTitle}</h2>
        <p>{siteCopy.home.explainerBody}</p>
        <div className="explainer-points">
          {siteCopy.home.explainerPoints.map((point) => (
            <article key={point.title} className="explainer-point">
              <h3>{point.title}</h3>
              <p>{point.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="home-lab-picker" className="home-lab-picker">
        <div className="section-heading">
          <div>
            <div className="section-label">{siteCopy.labIndex.eyebrow}</div>
            <h2>{siteCopy.labIndex.titlePrefix} {siteCopy.labIndex.titleAccent}</h2>
          </div>
          <p>{siteCopy.labIndex.lede}</p>
        </div>
        <DemoTabs />
      </section>
    </div>
  );
}
