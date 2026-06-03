export function PipelineStepCard({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="pipeline-card">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
