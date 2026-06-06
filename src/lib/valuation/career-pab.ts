import type { Position } from "@/types/database";
import type { SeasonTier } from "./types";

/** Tiers that contribute positive value; bench and below contribute zero. */
export const VALUABLE_TIERS = ["elite", "star", "starter"] as const;
export type ValuableTier = (typeof VALUABLE_TIERS)[number];

export type TierSeasonCounts = Record<ValuableTier, number>;

export type TierPabRates = Record<ValuableTier, number>;

export function emptyTierSeasonCounts(): TierSeasonCounts {
  return { elite: 0, star: 0, starter: 0 };
}

export function toValuableTierPab(
  pab: Record<SeasonTier, number>,
): TierPabRates {
  return {
    elite: Math.max(0, pab.elite),
    star: Math.max(0, pab.star),
    starter: Math.max(0, pab.starter),
  };
}

export function seasonPabContribution(
  tier: SeasonTier | null,
  rates: TierPabRates,
): number {
  if (!tier || tier === "bench") return 0;
  return rates[tier];
}

export function careerPabFromTierCounts(
  counts: TierSeasonCounts | Record<ValuableTier, number>,
  rates: TierPabRates,
): number {
  return (
    counts.elite * rates.elite +
    counts.star * rates.star +
    counts.starter * rates.starter
  );
}

export function addTierSeasonCounts(
  a: TierSeasonCounts,
  b: TierSeasonCounts,
): TierSeasonCounts {
  return {
    elite: a.elite + b.elite,
    star: a.star + b.star,
    starter: a.starter + b.starter,
  };
}

export function incrementTierCount(
  counts: TierSeasonCounts,
  tier: SeasonTier | null,
): TierSeasonCounts {
  if (!tier || tier === "bench") return counts;
  return { ...counts, [tier]: counts[tier] + 1 };
}

export type ProjectedCareerValue = {
  position: Position;
  realizedCounts: TierSeasonCounts;
  projectedRemainingCounts: TierSeasonCounts;
  totalCounts: TierSeasonCounts;
  realizedPab: number;
  projectedRemainingPab: number;
  totalCareerPab: number;
};

export function buildCareerValue(
  position: Position,
  realizedCounts: TierSeasonCounts,
  projectedRemainingCounts: TierSeasonCounts,
  rates: TierPabRates,
): ProjectedCareerValue {
  const totalCounts = addTierSeasonCounts(realizedCounts, projectedRemainingCounts);
  const realizedPab = careerPabFromTierCounts(realizedCounts, rates);
  const projectedRemainingPab = careerPabFromTierCounts(
    projectedRemainingCounts,
    rates,
  );

  return {
    position,
    realizedCounts,
    projectedRemainingCounts,
    totalCounts,
    realizedPab,
    projectedRemainingPab,
    totalCareerPab: realizedPab + projectedRemainingPab,
  };
}
