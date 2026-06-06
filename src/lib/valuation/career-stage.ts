import type { Position } from "@/types/database";
import type { TierSeasonCounts } from "./career-pab";
import type { RecentPerformance } from "./recent-performance";

export type CareerQuartile = 1 | 2 | 3 | 4;

export const CAREER_QUARTILE_LABELS: Record<CareerQuartile, string> = {
  1: "early",
  2: "mid-early",
  3: "mid-late",
  4: "late",
};

/**
 * Career progress quartile using known or estimated total career length.
 * Q1 = first 25% of career, Q4 = final 25%.
 */
export function careerQuartile(
  yearsPlayed: number,
  totalSeasons: number,
): CareerQuartile {
  const progress = yearsPlayed / Math.max(totalSeasons, 1);
  if (progress <= 0.25) return 1;
  if (progress <= 0.5) return 2;
  if (progress <= 0.75) return 3;
  return 4;
}

export function estimateTotalSeasons(
  positionMedians: Map<string, number>,
  position: string,
  yearsPlayed: number,
): number {
  const medianLength = positionMedians.get(position);
  if (!medianLength || medianLength <= yearsPlayed) {
    return Math.max(yearsPlayed + 2, yearsPlayed);
  }
  return medianLength;
}

/** Typical retirement age for players still producing valuable seasons. */
const POSITION_RETIRE_AGE: Record<Position, number> = {
  QB: 38,
  RB: 30,
  WR: 34,
  TE: 35,
};

export type ActiveCareerContext = {
  peakTier: number;
  recent: RecentPerformance;
  ageProxy: number | null;
  tiersSoFar: TierSeasonCounts;
};

/**
 * Estimate total career length for active players using age, peak tier,
 * and recent performance — not population median alone.
 */
export function estimateActiveCareerTotal(
  positionMedians: Map<string, number>,
  position: Position,
  yearsPlayed: number,
  context: ActiveCareerContext,
): number {
  const medianFloor = estimateTotalSeasons(positionMedians, position, yearsPlayed);
  let ageBasedTotal = yearsPlayed + 2;

  if (context.ageProxy) {
    const eliteBonus =
      context.peakTier >= 4 ? 3 : context.peakTier >= 3 ? 1 : 0;
    const recentBonus =
      context.recent.recentValuableSeasons >= 2
        ? 2
        : context.recent.recentValuableSeasons >= 1
          ? 1
          : 0;
    const retireAge = POSITION_RETIRE_AGE[position] + eliteBonus + recentBonus;
    const remainingByAge = Math.max(1, retireAge - context.ageProxy);
    ageBasedTotal = yearsPlayed + remainingByAge;
  }

  const recentElitePath =
    context.recent.recentElite >= 1 && context.peakTier >= 4
      ? yearsPlayed + 8
      : 0;

  const productivePath =
    context.recent.recentValuableSeasons >= 2
      ? yearsPlayed + 5
      : yearsPlayed + 2;

  return Math.max(medianFloor, ageBasedTotal, recentElitePath, productivePath);
}
