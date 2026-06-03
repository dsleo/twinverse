export function StackRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="stack-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
