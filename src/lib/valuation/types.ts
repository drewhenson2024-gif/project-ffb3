import type { Position } from "@/types/database";

export type ScoringStyle = "ppr" | "half_ppr" | "standard";

export type SeasonTier = "elite" | "star" | "starter" | "bench";

export type LeagueConfig = {
  teams: number;
  starting: Record<Position, number>;
  benchSpots: number;
  taxiSpots: number;
  scoring: ScoringStyle;
};

export type PositionThresholds = {
  position: Position;
  elite: number;
  star: number;
  starter: number;
  benchEnd: number;
  ranges: Record<SeasonTier, { from: number; to: number }>;
};

export type TierAverages = Record<SeasonTier, number>;

export type PositionPab = {
  position: Position;
  thresholds: PositionThresholds;
  averages: TierAverages;
  pab: Record<SeasonTier, number>;
  sampleCounts: Record<SeasonTier, number>;
};

export const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

export const BENCH_POSITION_SHARE: Record<Position, number> = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 1,
};

export const BENCH_SHARE_TOTAL = 7;

export const VALUATION_HISTORY_YEARS = 6;

export const DEFAULT_LEAGUE_CONFIG: LeagueConfig = {
  teams: 16,
  starting: { QB: 1, RB: 2, WR: 2, TE: 1 },
  benchSpots: 7,
  taxiSpots: 2,
  scoring: "ppr",
};
