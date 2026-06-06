import { scoringLabel } from "@/lib/valuation/scoring";
import { tierLabel } from "@/lib/valuation/parse-config";
import type { LeagueConfig, PositionPab, SeasonTier } from "@/lib/valuation/types";

const TIERS: SeasonTier[] = ["elite", "star", "starter", "bench"];

type ValuationResultsProps = {
  config: LeagueConfig;
  years: number[];
  positions: PositionPab[];
};

export function ValuationResults({
  config,
  years,
  positions,
}: ValuationResultsProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-sm text-emerald-50/90">
        <p>
          <span className="font-semibold text-emerald-200">Method:</span> Rank
          players by position within each of the last {years.length} seasons (
          {years.sort((a, b) => a - b).join(", ")}), classify by league
          thresholds, average fantasy points per tier, then compute{" "}
          <span className="font-mono text-emerald-200">PAB</span> (Points Above
          Bench) vs the bench tier average.
        </p>
        <p className="mt-2">
          Scoring: <span className="font-semibold">{scoringLabel(config.scoring)}</span>
        </p>
      </div>

      {positions.map((pos) => (
        <section
          key={pos.position}
          className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50"
        >
          <div className="border-b border-white/10 px-5 py-4">
            <h3 className="text-lg font-semibold text-white">{pos.position}</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Elite {formatRange(pos.thresholds.ranges.elite)} · Star{" "}
              {formatRange(pos.thresholds.ranges.star)} · Starter{" "}
              {formatRange(pos.thresholds.ranges.starter)} · Bench{" "}
              {formatRange(pos.thresholds.ranges.bench)}
            </p>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950/60 text-zinc-400">
              <tr>
                <th className="px-5 py-3 font-medium">Tier</th>
                <th className="px-5 py-3 font-medium">Rank range</th>
                <th className="px-5 py-3 text-right font-medium">Avg pts</th>
                <th className="px-5 py-3 text-right font-medium">PAB</th>
                <th className="px-5 py-3 text-right font-medium">Samples</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tier) => (
                <tr key={tier} className="border-t border-white/5">
                  <td className="px-5 py-3 font-medium capitalize text-white">
                    {tierLabel(tier)}
                  </td>
                  <td className="px-5 py-3 text-zinc-400">
                    {formatRange(pos.thresholds.ranges[tier])}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-zinc-200">
                    {pos.averages[tier].toFixed(1)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-emerald-300">
                    {tier === "bench"
                      ? "—"
                      : `${pos.pab[tier] >= 0 ? "+" : ""}${pos.pab[tier].toFixed(1)}`}
                  </td>
                  <td className="px-5 py-3 text-right text-zinc-500">
                    {pos.sampleCounts[tier]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function formatRange(range: { from: number; to: number }): string {
  if (range.to < range.from) return "—";
  if (range.from === range.to) return String(range.from);
  return `${range.from}–${range.to}`;
}
