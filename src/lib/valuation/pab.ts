import type { Position } from "@/types/database";
import type { FantasySeasonStats } from "@/types/database";
import { classifyRank, getPositionThresholds } from "./thresholds";
import { scoringColumn } from "./scoring";
import {
  POSITIONS,
  VALUATION_HISTORY_YEARS,
  type LeagueConfig,
  type PositionPab,
  type SeasonTier,
  type TierAverages,
} from "./types";

type SeasonRow = Pick<
  FantasySeasonStats,
  "season_year" | "position" | "fantasy_points_ppr" | "fantasy_points_half_ppr" | "fantasy_points_standard"
>;

const TIERS: SeasonTier[] = ["elite", "star", "starter", "bench"];

function getPoints(row: SeasonRow, config: LeagueConfig): number {
  const col = scoringColumn(config.scoring);
  return Number(row[col] ?? 0);
}

function emptyTierTotals(): Record<SeasonTier, { sum: number; count: number }> {
  return {
    elite: { sum: 0, count: 0 },
    star: { sum: 0, count: 0 },
    starter: { sum: 0, count: 0 },
    bench: { sum: 0, count: 0 },
  };
}

function toAverages(
  totals: Record<SeasonTier, { sum: number; count: number }>,
): { averages: TierAverages; sampleCounts: Record<SeasonTier, number> } {
  const averages = {} as TierAverages;
  const sampleCounts = {} as Record<SeasonTier, number>;

  for (const tier of TIERS) {
    const { sum, count } = totals[tier];
    sampleCounts[tier] = count;
    averages[tier] = count > 0 ? sum / count : 0;
  }

  return { averages, sampleCounts };
}

export function getValuationSeasonYears(
  availableYears: number[],
  count = VALUATION_HISTORY_YEARS,
): number[] {
  const sorted = [...availableYears].sort((a, b) => b - a);
  return sorted.slice(0, count);
}

export function computePositionPab(
  config: LeagueConfig,
  position: Position,
  seasons: SeasonRow[],
  years: number[],
): PositionPab {
  const thresholds = getPositionThresholds(config, position);
  const totals = emptyTierTotals();

  for (const year of years) {
    const yearRows = seasons
      .filter((s) => s.season_year === year && s.position === position)
      .sort((a, b) => getPoints(b, config) - getPoints(a, config));

    yearRows.forEach((row, index) => {
      const rank = index + 1;
      const tier = classifyRank(rank, thresholds);
      if (!tier) return;
      const pts = getPoints(row, config);
      totals[tier].sum += pts;
      totals[tier].count += 1;
    });
  }

  const { averages, sampleCounts } = toAverages(totals);
  const benchAvg = averages.bench;

  const pab = {} as Record<SeasonTier, number>;
  for (const tier of TIERS) {
    pab[tier] = averages[tier] - benchAvg;
  }

  return { position, thresholds, averages, pab, sampleCounts };
}

export function computeValuation(
  config: LeagueConfig,
  seasons: SeasonRow[],
): { years: number[]; positions: PositionPab[] } {
  const availableYears = [
    ...new Set(seasons.map((s) => s.season_year)),
  ];
  const years = getValuationSeasonYears(availableYears);

  const positions = POSITIONS.map((position) =>
    computePositionPab(config, position, seasons, years),
  );

  return { years, positions };
}
