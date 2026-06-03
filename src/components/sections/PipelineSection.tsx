import { pipelineSteps } from "../../config/demoContent";
import { siteCopy } from "../../config/siteCopy";
import { PipelineStepCard } from "../ui/PipelineStepCard";

export function PipelineSection() {
  return (
    <section className="pipeline-section">
      <div className="section-heading">
        <div>
          <div className="section-label">{siteCopy.method.label}</div>
          <h2>Inputs, personas, evidence</h2>
        </div>
        <p>Every route uses the same pattern: start from current signals, compare the persona panel, and return a traceable readout.</p>
      </div>
      <div className="pipeline-grid">
        {pipelineSteps.map((step) => (
          <PipelineStepCard key={step.number} number={step.number} title={step.title} text={step.text} />
        ))}
      </div>
    </section>
  );
}
