import { motion } from "framer-motion";
import { siteCopy } from "../../config/siteCopy";

export function ComputePanel({
  status,
  progress,
  onRun,
  error,
  runLabel = siteCopy.lab.rerunLabel,
  embedded = false,
  showButton = true,
}: {
  status: "idle" | "running" | "complete" | "error";
  progress: number;
  stages: readonly string[];
  onRun: () => void;
  error: string | null;
  runLabel?: string;
  embedded?: boolean;
  showButton?: boolean;
}) {
  const displayProgress = Math.min(100, Math.max(0, progress));

  return (
    <section className={`compute-panel ${embedded ? "compute-inline" : "compute-spotlight"}`}>
      {embedded ? null : (
        <div className="section-heading">
          <div>
            <div className="section-label">{siteCopy.compute.label}</div>
            <h2>{siteCopy.compute.title}</h2>
          </div>
          <p>{siteCopy.compute.description}</p>
        </div>
      )}
      <div className="compute-card compute-card-single">
        {showButton ? (
          <button className="accent-button compute-run-button" onClick={onRun} disabled={status === "running"}>
            {runLabel}
          </button>
        ) : null}
        <div
          className="compute-meter"
          role="progressbar"
          aria-label={siteCopy.compute.progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={displayProgress}
        >
          <motion.div
            className="compute-meter-fill"
            initial={false}
            animate={{ width: `${displayProgress}%` }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <div className="compute-meta compute-status-bar">
          <strong className={`status-pill status-${status}`}>{siteCopy.compute.status[status]}</strong>
          <span>{displayProgress}%</span>
        </div>
        {error ? <p className="compute-error">{error}</p> : null}
      </div>
    </section>
  );
}
