"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/personas", label: "Personas" },
  { href: "/lab", label: "Lab" },
];

export function SiteHeader() {
  const pathname = usePathname() ?? "";

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-mark" aria-label="Tweenverse home">
          <strong>Tweenverse</strong>
        </Link>

        <nav className="site-nav" aria-label="Primary">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`site-nav-link ${isActive ? "active" : ""}`} aria-current={isActive ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
