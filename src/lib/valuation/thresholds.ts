import type { Position } from "@/types/database";
import {
  BENCH_POSITION_SHARE,
  BENCH_SHARE_TOTAL,
  type LeagueConfig,
  type PositionThresholds,
  type SeasonTier,
} from "./types";

export function getPositionThresholds(
  config: LeagueConfig,
  position: Position,
): PositionThresholds {
  const starter = config.teams * config.starting[position];
  const star = Math.floor(starter / 2);
  const elite = Math.floor(star / 2);
  const benchSlotsLeague = config.teams * config.benchSpots;
  const benchPositionSlots = Math.floor(
    (benchSlotsLeague * BENCH_POSITION_SHARE[position]) / BENCH_SHARE_TOTAL,
  );
  const benchEnd = starter + benchPositionSlots;

  const ranges: Record<SeasonTier, { from: number; to: number }> = {
    elite: { from: 1, to: elite },
    star: { from: elite + 1, to: star },
    starter: { from: star + 1, to: starter },
    bench: { from: starter + 1, to: benchEnd },
  };

  return { position, elite, star, starter, benchEnd, ranges };
}

export function classifyRank(
  rank: number,
  thresholds: PositionThresholds,
): SeasonTier | null {
  if (rank <= thresholds.elite) return "elite";
  if (rank <= thresholds.star) return "star";
  if (rank <= thresholds.starter) return "starter";
  if (rank <= thresholds.benchEnd) return "bench";
  return null;
}
