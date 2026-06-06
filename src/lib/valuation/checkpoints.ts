import type { Position } from "@/types/database";
import {
  emptyTierSeasonCounts,
  incrementTierCount,
  type TierSeasonCounts,
} from "./career-pab";
import { careerQuartile, type CareerQuartile } from "./career-stage";
import type { SeasonTier } from "./types";

export type TierCountsSoFar = TierSeasonCounts & { bench: number };

export type ProjectionCheckpoint = {
  playerId: number;
  position: Position;
  yearsPlayed: number;
  totalSeasons: number;
  careerQuartile: CareerQuartile;
  isUndrafted: boolean;
  draftPick: number | null;
  draftYear: number | null;
  tiersSoFar: TierSeasonCounts;
  benchSoFar: number;
  remainingTiers: TierSeasonCounts;
  peakTier: number;
  gamesPlayed: number;
  ageProxy: number | null;
};

type SeasonEntry = {
  tier: SeasonTier | null;
  games: number;
  position: Position;
};

function tierOrdinal(tier: SeasonTier | null): number {
  if (tier === "elite") return 4;
  if (tier === "star") return 3;
  if (tier === "starter") return 2;
  if (tier === "bench") return 1;
  return 0;
}

export type PlayerCareerInput = {
  playerId: number;
  position: Position;
  isUndrafted: boolean;
  draftPick: number | null;
  draftYear: number | null;
  seasons: Map<number, SeasonEntry>;
};

export function buildPlayerCareers(
  seasonPab: Map<number, Map<number, SeasonEntry>>,
  playerMeta: Map<
    number,
    {
      position: Position;
      isUndrafted: boolean;
      draftPick: number | null;
      draftYear: number | null;
    }
  >,
): PlayerCareerInput[] {
  const careers: PlayerCareerInput[] = [];

  for (const [playerId, seasons] of seasonPab) {
    const meta = playerMeta.get(playerId);
    if (!meta || seasons.size === 0) continue;

    careers.push({
      playerId,
      position: meta.position,
      isUndrafted: meta.isUndrafted,
      draftPick: meta.draftPick,
      draftYear: meta.draftYear,
      seasons,
    });
  }

  return careers;
}

export function buildCheckpointsForCareer(career: PlayerCareerInput): ProjectionCheckpoint[] {
  const sortedYears = [...career.seasons.keys()].sort((a, b) => a - b);
  const totalSeasons = sortedYears.length;
  const totalTiers = emptyTierSeasonCounts();
  let totalBench = 0;

  for (const year of sortedYears) {
    const entry = career.seasons.get(year)!;
    if (entry.tier && entry.tier !== "bench") {
      totalTiers[entry.tier] += 1;
    } else if (entry.tier === "bench") {
      totalBench += 1;
    }
  }

  const checkpoints: ProjectionCheckpoint[] = [];
  const tiersSoFar = emptyTierSeasonCounts();
  let benchSoFar = 0;
  let games = 0;
  let peakTier = 0;

  for (let i = 0; i < sortedYears.length; i++) {
    const year = sortedYears[i];
    const entry = career.seasons.get(year)!;
    if (entry.tier === "bench") benchSoFar += 1;
    else if (entry.tier) tiersSoFar[entry.tier] += 1;
    peakTier = Math.max(peakTier, tierOrdinal(entry.tier));
    games += entry.games;

    const yearsPlayed = i + 1;
    const remainingTiers: TierSeasonCounts = {
      elite: totalTiers.elite - tiersSoFar.elite,
      star: totalTiers.star - tiersSoFar.star,
      starter: totalTiers.starter - tiersSoFar.starter,
    };

    checkpoints.push({
      playerId: career.playerId,
      position: career.position,
      yearsPlayed,
      totalSeasons,
      careerQuartile: careerQuartile(yearsPlayed, totalSeasons),
      isUndrafted: career.isUndrafted,
      draftPick: career.draftPick,
      draftYear: career.draftYear,
      tiersSoFar: { ...tiersSoFar },
      benchSoFar,
      remainingTiers,
      peakTier,
      gamesPlayed: games,
      ageProxy: career.draftYear ? year - career.draftYear + 22 : null,
    });
  }

  return checkpoints;
}

export function buildAllCheckpoints(careers: PlayerCareerInput[]): ProjectionCheckpoint[] {
  return careers.flatMap((career) => buildCheckpointsForCareer(career));
}

export function checkpointAtYear(
  career: PlayerCareerInput,
  yearsPlayed: number,
): ProjectionCheckpoint | null {
  const checkpoints = buildCheckpointsForCareer(career);
  return checkpoints.find((row) => row.yearsPlayed === yearsPlayed) ?? null;
}

/** Checkpoint for an active player using estimated total career length for quartile. */
export function buildActiveProjectionCheckpoint(
  career: PlayerCareerInput,
  estimatedTotalSeasons: number,
): ProjectionCheckpoint | null {
  const sortedYears = [...career.seasons.keys()].sort((a, b) => a - b);
  if (!sortedYears.length) return null;

  const tiersSoFar = emptyTierSeasonCounts();
  let benchSoFar = 0;
  let games = 0;
  let peakTier = 0;

  for (const year of sortedYears) {
    const entry = career.seasons.get(year)!;
    if (entry.tier === "bench") benchSoFar += 1;
    else if (entry.tier) tiersSoFar[entry.tier] += 1;
    peakTier = Math.max(peakTier, tierOrdinal(entry.tier));
    games += entry.games;
  }

  const yearsPlayed = sortedYears.length;
  const lastYear = sortedYears[sortedYears.length - 1];

  return {
    playerId: career.playerId,
    position: career.position,
    yearsPlayed,
    totalSeasons: estimatedTotalSeasons,
    careerQuartile: careerQuartile(yearsPlayed, estimatedTotalSeasons),
    isUndrafted: career.isUndrafted,
    draftPick: career.draftPick,
    draftYear: career.draftYear,
    tiersSoFar: { ...tiersSoFar },
    benchSoFar,
    remainingTiers: emptyTierSeasonCounts(),
    peakTier,
    gamesPlayed: games,
    ageProxy: career.draftYear ? lastYear - career.draftYear + 22 : null,
  };
}

export function toValuableTiersSoFar(tiers: TierSeasonCounts): TierSeasonCounts {
  return { ...tiers };
}
