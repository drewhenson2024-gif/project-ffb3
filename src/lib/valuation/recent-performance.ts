import { emptyTierSeasonCounts, type TierSeasonCounts } from "./career-pab";
import type { SeasonTier } from "./types";

export const RECENT_SEASON_WINDOW = 3;

export type RecentPerformance = {
  recentElite: number;
  recentStar: number;
  recentStarter: number;
  recentValuableSeasons: number;
  recentPabRate: number;
  lastSeasonTier: number;
  momentum: number;
};

type SeasonSnapshot = {
  tier: SeasonTier | null;
  pab: number;
};

function tierOrdinal(tier: SeasonTier | null): number {
  if (tier === "elite") return 4;
  if (tier === "star") return 3;
  if (tier === "starter") return 2;
  if (tier === "bench") return 1;
  return 0;
}

function isValuable(tier: SeasonTier | null): boolean {
  return tier === "elite" || tier === "star" || tier === "starter";
}

export function computeRecentPerformance(
  sortedYears: number[],
  seasons: Map<number, SeasonSnapshot>,
  careerTiersSoFar: TierSeasonCounts,
): RecentPerformance {
  const windowYears = sortedYears.slice(-RECENT_SEASON_WINDOW);
  const recent = emptyTierSeasonCounts();
  let recentPab = 0;
  let recentValuable = 0;

  for (const year of windowYears) {
    const entry = seasons.get(year);
    if (!entry) continue;
    if (entry.tier === "elite") recent.elite += 1;
    else if (entry.tier === "star") recent.star += 1;
    else if (entry.tier === "starter") recent.starter += 1;
    if (isValuable(entry.tier)) recentValuable += 1;
    recentPab += entry.pab;
  }

  const lastYear = sortedYears[sortedYears.length - 1];
  const lastEntry = seasons.get(lastYear);
  const yearsPlayed = sortedYears.length;
  const careerValuable =
    careerTiersSoFar.elite + careerTiersSoFar.star + careerTiersSoFar.starter;
  const careerValuableRate = careerValuable / Math.max(yearsPlayed, 1);
  const recentValuableRate = recentValuable / Math.max(windowYears.length, 1);

  return {
    recentElite: recent.elite,
    recentStar: recent.star,
    recentStarter: recent.starter,
    recentValuableSeasons: recentValuable,
    recentPabRate: recentPab / Math.max(windowYears.length, 1),
    lastSeasonTier: tierOrdinal(lastEntry?.tier ?? null),
    momentum: recentValuableRate - careerValuableRate,
  };
}
