import type { Position } from "@/types/database";
import {
  careerPabFromTierCounts,
  emptyTierSeasonCounts,
  type TierPabRates,
  type TierSeasonCounts,
  VALUABLE_TIERS,
  type ValuableTier,
} from "./career-pab";

/** Fractional expected tier-season counts (probability-weighted). */
export type TierSeasonExpectations = TierSeasonCounts;

export type TierHitProbabilities = Record<ValuableTier, number>;

export type CohortExpectedValue = {
  sampleSize: number;
  expectedCounts: TierSeasonExpectations;
  hitProbabilities: TierHitProbabilities;
  expectedCareerPab: number;
};

export function meanTierCounts(counts: TierSeasonCounts[]): TierSeasonExpectations {
  if (!counts.length) return emptyTierSeasonCounts();

  const totals = emptyTierSeasonCounts();
  for (const row of counts) {
    totals.elite += row.elite;
    totals.star += row.star;
    totals.starter += row.starter;
  }

  return {
    elite: totals.elite / counts.length,
    star: totals.star / counts.length,
    starter: totals.starter / counts.length,
  };
}

export function tierHitProbabilities(counts: TierSeasonCounts[]): TierHitProbabilities {
  if (!counts.length) {
    return { elite: 0, star: 0, starter: 0 };
  }

  const hits = { elite: 0, star: 0, starter: 0 };
  for (const row of counts) {
    for (const tier of VALUABLE_TIERS) {
      if (row[tier] > 0) hits[tier] += 1;
    }
  }

  const n = counts.length;
  return {
    elite: hits.elite / n,
    star: hits.star / n,
    starter: hits.starter / n,
  };
}

/**
 * Expected career PAB = Σ E[tier seasons] × tier PAB rate.
 * Equivalent to chance × per-season value when expectations are mean counts.
 */
export function expectedCareerPab(
  expectations: TierSeasonExpectations,
  rates: TierPabRates,
): number {
  return careerPabFromTierCounts(expectations, rates);
}

export function cohortExpectedValue(
  tierCounts: TierSeasonCounts[],
  rates: TierPabRates,
): CohortExpectedValue {
  const expectedCounts = meanTierCounts(tierCounts);
  return {
    sampleSize: tierCounts.length,
    expectedCounts,
    hitProbabilities: tierHitProbabilities(tierCounts),
    expectedCareerPab: expectedCareerPab(expectedCounts, rates),
  };
}

export function blendExpectations(
  draftPrior: TierSeasonExpectations,
  compProjection: TierSeasonExpectations,
  draftWeight: number,
): TierSeasonExpectations {
  const performanceWeight = 1 - draftWeight;
  return {
    elite:
      draftWeight * draftPrior.elite + performanceWeight * compProjection.elite,
    star: draftWeight * draftPrior.star + performanceWeight * compProjection.star,
    starter:
      draftWeight * draftPrior.starter +
      performanceWeight * compProjection.starter,
  };
}

export type PlayerTierProfile = {
  playerId: number;
  position: Position;
  tierCounts: TierSeasonCounts;
  careerPab: number;
};

export function buildCohortProfiles(
  profiles: PlayerTierProfile[],
  filter: (profile: PlayerTierProfile) => boolean,
): PlayerTierProfile[] {
  return profiles.filter(filter);
}
