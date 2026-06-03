import { DemoTabs } from "../components/sections/DemoTabs";
import { siteCopy } from "../config/siteCopy";

export function LabIndexPage() {
  return (
    <div className="lab-stack lab-editorial">
      <section className="hero-grid hero-grid-single">
        <div className="hero-copy">
          <div className="eyebrow">{siteCopy.labIndex.eyebrow}</div>
          <h1>
            {siteCopy.labIndex.titlePrefix} <span>{siteCopy.labIndex.titleAccent}</span>
          </h1>
          <p className="hero-lede">{siteCopy.labIndex.lede}</p>
        </div>
      </section>
      <DemoTabs />
    </div>
  );
}
