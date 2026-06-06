import type { Position } from "@/types/database";
import { meanTierCounts, type TierSeasonExpectations } from "./expected-value";
import { median } from "./regression";
import type { CareerQuartile } from "./career-stage";
import type { TierSeasonCounts } from "./career-pab";

export const MIN_COMP_SAMPLES = 5;

export type CompCandidate = {
  playerId: number;
  position: Position;
  yearsPlayed: number;
  careerQuartile: CareerQuartile;
  isUndrafted: boolean;
  draftPick: number | null;
  tiersSoFar: TierSeasonCounts;
  remainingTiers: TierSeasonCounts;
};

export type CompQuery = {
  position: Position;
  yearsPlayed: number;
  careerQuartile: CareerQuartile;
  isUndrafted: boolean;
  draftPick: number | null;
  tiersSoFar: TierSeasonCounts;
};

function within(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance;
}

function tightMatch(query: CompQuery, candidate: CompCandidate): boolean {
  if (candidate.position !== query.position) return false;
  if (candidate.careerQuartile !== query.careerQuartile) return false;
  if (!within(candidate.yearsPlayed, query.yearsPlayed, 1)) return false;
  if (!within(candidate.tiersSoFar.elite, query.tiersSoFar.elite, 1)) return false;
  if (!within(candidate.tiersSoFar.star, query.tiersSoFar.star, 1)) return false;
  if (!within(candidate.tiersSoFar.starter, query.tiersSoFar.starter, 1)) return false;

  if (query.isUndrafted) {
    return candidate.isUndrafted;
  }

  if (!candidate.draftPick || !query.draftPick) return false;
  return Math.abs(candidate.draftPick - query.draftPick) <= 24;
}

function looseMatch(query: CompQuery, candidate: CompCandidate): boolean {
  if (candidate.position !== query.position) return false;
  if (!within(candidate.yearsPlayed, query.yearsPlayed, 2)) return false;

  if (query.isUndrafted) {
    return candidate.isUndrafted;
  }

  return true;
}

export function findCompRemainingTiers(
  pool: CompCandidate[],
  query: CompQuery,
): { expectations: TierSeasonExpectations; sampleSize: number; matchType: "tight" | "loose" | "none" } {
  let matches = pool.filter((candidate) => tightMatch(query, candidate));
  let matchType: "tight" | "loose" | "none" = "tight";

  if (matches.length < MIN_COMP_SAMPLES) {
    matches = pool.filter((candidate) => looseMatch(query, candidate));
    matchType = "loose";
  }

  if (!matches.length) {
    return {
      expectations: { elite: 0, star: 0, starter: 0 },
      sampleSize: 0,
      matchType: "none",
    };
  }

  return {
    expectations: meanTierCounts(matches.map((m) => m.remainingTiers)),
    sampleSize: matches.length,
    matchType,
  };
}

export function medianRemainingPab(
  pool: CompCandidate[],
  query: CompQuery,
  toPab: (tiers: TierSeasonCounts) => number,
): number {
  let matches = pool.filter((candidate) => tightMatch(query, candidate));
  if (matches.length < MIN_COMP_SAMPLES) {
    matches = pool.filter((candidate) => looseMatch(query, candidate));
  }
  if (!matches.length) return 0;
  return median(matches.map((m) => toPab(m.remainingTiers)));
}
