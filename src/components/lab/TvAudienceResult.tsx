"use client";

import type { PersistedLabRun } from "../../lib/labSchemas";

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function getDeltaColor(delta: number): string {
  if (Math.abs(delta) < 2) return "text-gray-600";
  if (delta > 0) return "text-red-600"; // Over-predicted
  return "text-green-600"; // Under-predicted
}

interface TvAudienceResultProps {
  run: PersistedLabRun;
}

export function TvAudienceResult({ run }: TvAudienceResultProps) {
  const { tvPredictions, tvEvaluation } = run;

  if (!tvPredictions || tvPredictions.length === 0) {
    return <div className="text-gray-500">No predictions available yet.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      {tvEvaluation && (
        <div className="grid grid-cols-3 gap-4 rounded-lg bg-blue-50 p-4">
          <div>
            <div className="text-sm font-semibold text-blue-900">MAE</div>
            <div className="mt-1 text-2xl font-bold text-blue-700">{tvEvaluation.mae.toFixed(2)}%</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-blue-900">Spearman ρ</div>
            <div className="mt-1 text-2xl font-bold text-blue-700">{tvEvaluation.spearmanRho.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-blue-900">Top-1 Hit</div>
            <div className="mt-1 text-2xl font-bold text-blue-700">{tvEvaluation.top1Hit ? "✓" : "✗"}</div>
          </div>
        </div>
      )}

      {/* Predictions Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-300 bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-gray-800">Rank</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-800">Channel</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-800">Program</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-800">Genre</th>
              <th className="px-4 py-2 text-right font-semibold text-gray-800">Predicted %</th>
              {tvEvaluation && (
                <>
                  <th className="px-4 py-2 text-right font-semibold text-gray-800">Actual %</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-800">Delta</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {tvPredictions.map((pred, idx) => {
              const actualData = tvEvaluation?.perProgramDelta.find((d) => d.programName === pred.programName);

              return (
                <tr key={`${pred.channel}-${pred.programName}`} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-3 font-semibold text-gray-700">{pred.predictedRank}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{pred.channel}</td>
                  <td className="px-4 py-3 text-gray-700">{pred.programName}</td>
                  <td className="px-4 py-3 text-gray-600">{run.tvSchedule.find((s) => s.programName === pred.programName)?.genre}</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">{formatPercent(pred.predictedSharePct)}</td>
                  {actualData && (
                    <>
                      <td className="px-4 py-3 text-right font-semibold text-gray-700">{formatPercent(actualData.actual)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${getDeltaColor(actualData.delta)}`}>
                        {actualData.delta > 0 ? "+" : ""}
                        {formatPercent(actualData.delta)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 rounded bg-gray-50 p-3 text-sm text-gray-600">
        <p className="font-semibold text-gray-700">Color guide:</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li className="text-green-600">Green = Under-predicted (actual &gt; predicted)</li>
          <li className="text-red-600">Red = Over-predicted (actual &lt; predicted)</li>
          <li className="text-gray-600">Gray = Very close (&lt;2% delta)</li>
        </ul>
      </div>
    </div>
  );
}
