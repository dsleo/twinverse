import { Outlet } from "react-router-dom";

export function SiteLayout() {
  return (
    <div className="site-shell">
      <main className="page-shell">
        <Outlet />
      </main>
    </div>
  );
}
