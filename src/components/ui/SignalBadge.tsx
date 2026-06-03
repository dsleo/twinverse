import type { ReactNode } from "react";

export function SignalBadge({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="signal-badge">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
