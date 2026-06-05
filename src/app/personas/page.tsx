import { PersonasPageClient } from "../../components/personas/PersonasPageClient";
import { listPersonas } from "../../lib/contentRepository";

export default function PersonasPage() {
  return (
    <main className="page-shell">
      <PersonasPageClient personas={listPersonas()} />
    </main>
  );
}
