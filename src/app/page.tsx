import Link from "next/link";
import { SourceSignalStrip } from "../components/home/SourceSignalStrip";
import { listSourceReferences } from "../lib/contentRepository";

export default function Page() {
  const sources = listSourceReferences();

  return (
    <main className="page-shell">
      <div className="home-editorial">
        <section className="home-hero home-surface">
          <h1>Predict the future through popular wisdom.</h1>
          <div className="cta-row hero-actions home-cta-row">
            <Link href="/lab" className="accent-button home-cta">
              Open the Lab
            </Link>
            <Link href="/lab/figaro" className="ghost-button home-cta">
              Question du jour
            </Link>
            <Link href="/personas" className="ghost-button home-cta">
              View Personas
            </Link>
          </div>
        </section>

        <SourceSignalStrip sources={sources} />
      </div>
    </main>
  );
}
