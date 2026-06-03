import { NavLink } from "react-router-dom";
import { demoMeta } from "../../config/demoContent";
import { labActionOrder } from "../../config/siteCopy";
import type { DemoKind } from "../../types";
import { demoToRoute } from "../../lib/demoRoutes";

export function DemoTabs({
  activeDemo,
}: {
  activeDemo?: DemoKind;
}) {
  return (
    <section className="demo-nav">
      {labActionOrder.map((demo) => (
        <NavLink
          key={demo}
          to={demoToRoute(demo)}
          className={`demo-tab ${demo === activeDemo ? "active" : ""}`}
          aria-label={demoMeta[demo].title}
        >
          <span>{demoMeta[demo].kicker}</span>
          <strong>{demoMeta[demo].title}</strong>
          <small>{demoMeta[demo].strap}</small>
        </NavLink>
      ))}
    </section>
  );
}
