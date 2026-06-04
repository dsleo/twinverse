import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-copy">
        <div className="eyebrow">Tweenverse</div>
        <h1>Run memory injection on a real server pipeline.</h1>
        <p>
          The memory route now executes with server-side retrieval, structured model outputs, filesystem persistence, and
          dynamic persona assignment.
        </p>
        <div className="cta-row">
          <Link href="/memory" className="accent-button">
            Open memory injection
          </Link>
        </div>
      </section>
    </main>
  );
}
