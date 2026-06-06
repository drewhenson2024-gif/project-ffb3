import type { createServerClient } from "@/lib/supabase/server";
import type { Position } from "@/types/database";
import {
  buildCareerValue,
  emptyTierSeasonCounts,
  incrementTierCount,
  type ProjectedCareerValue,
} from "./career-pab";
import {
  isCareerComplete,
  isCurrentRookie,
  recentSeasonYears,
} from "./career-complete";
import { careerQuartile, estimateTotalSeasons } from "./career-stage";
import {
  buildActiveProjectionCheckpoint,
  buildAllCheckpoints,
  buildPlayerCareers,
  type PlayerCareerInput,
} from "./checkpoints";
import { checkpointToCompCandidate } from "./projection-predict";
import { predictCheckpointTuned } from "./projection-predict";
import { trainProjectionModels } from "./projection-models";
import { getValuationSeasonYears } from "./pab";
import {
  buildPlayerSeasonPab,
  buildTierRatesByPosition,
  type CareerMeta,
} from "./player-profiles";
import { median } from "./regression";
import {
  loadAllSeasonStats,
  loadCareerMeta,
  loadPlayerIdentities,
} from "./season-data";
import type { CareerQuartile } from "./career-stage";
import type { LeagueConfig } from "./types";

export type PlayerProjection = ProjectedCareerValue & {
  playerId: number;
  yearsPlayed: number;
  careerQuartile: CareerQuartile;
  compSampleSize: number;
  compMatchType: string;
};

export type CareerProjectionSummary = {
  trainingCareers: number;
  trainingCheckpoints: number;
  activeProjected: number;
  skippedRookies: number;
};

export type CareerProjectionResult = {
  projections: Map<number, PlayerProjection>;
  summary: CareerProjectionSummary;
};

type SeasonEntry = {
  tier: import("./types").SeasonTier | null;
  games: number;
  position: Position;
};

function buildPositionMedianLengths(
  careers: PlayerCareerInput[],
): Map<string, number> {
  const lengths = new Map<Position, number[]>();

  for (const career of careers) {
    const list = lengths.get(career.position) ?? [];
    list.push(career.seasons.size);
    lengths.set(career.position, list);
  }

  const medians = new Map<string, number>();
  for (const [position, values] of lengths) {
    medians.set(position, median(values));
  }
  return medians;
}

function realizedTierCounts(career: PlayerCareerInput) {
  const counts = emptyTierSeasonCounts();
  for (const entry of career.seasons.values()) {
    Object.assign(counts, incrementTierCount(counts, entry.tier));
  }
  return counts;
}

function toSeasonPabMap(
  seasonPab: Awaited<ReturnType<typeof buildPlayerSeasonPab>>,
): Map<number, Map<number, SeasonEntry>> {
  return new Map(
    [...seasonPab.entries()].map(([playerId, seasons]) => [
      playerId,
      new Map(
        [...seasons.entries()].map(([year, entry]) => [
          year,
          { tier: entry.tier, games: entry.games, position: entry.position },
        ]),
      ),
    ]),
  );
}

function buildPlayerMeta(
  careers: CareerMeta[],
  seasonPab: Map<number, Map<number, SeasonEntry>>,
  playerById: Map<number, { is_undrafted: boolean; primary_position: Position }>,
): Map<
  number,
  {
    position: Position;
    isUndrafted: boolean;
    draftPick: number | null;
    draftYear: number | null;
  }
> {
  const meta = new Map<
    number,
    {
      position: Position;
      isUndrafted: boolean;
      draftPick: number | null;
      draftYear: number | null;
    }
  >();

  const careerById = new Map(careers.map((c) => [c.player_id, c]));

  for (const [playerId, seasons] of seasonPab) {
    if (!seasons.size) continue;
    const career = careerById.get(playerId);
    const player = playerById.get(playerId);
    const position =
      career?.draft_position ??
      player?.primary_position ??
      [...seasons.values()][0]?.position ??
      "WR";

    meta.set(playerId, {
      position,
      isUndrafted: player?.is_undrafted ?? !career?.draft_pick_overall,
      draftPick: career?.draft_pick_overall ?? null,
      draftYear: career?.draft_year ?? null,
    });
  }

  return meta;
}

export async function runCareerProjections(
  supabase: ReturnType<typeof createServerClient>,
  config: LeagueConfig,
): Promise<CareerProjectionResult> {
  const [seasons, careers, players] = await Promise.all([
    loadAllSeasonStats(supabase),
    loadCareerMeta(supabase),
    loadPlayerIdentities(supabase),
  ]);

  if (!seasons.length) {
    return {
      projections: new Map(),
      summary: {
        trainingCareers: 0,
        trainingCheckpoints: 0,
        activeProjected: 0,
        skippedRookies: 0,
      },
    };
  }

  const recent = new Set(recentSeasonYears());
  const recentPlayers = new Set<number>();
  for (const row of seasons) {
    if (recent.has(row.season_year)) recentPlayers.add(row.player_id);
  }

  const careerById = new Map(careers.map((c) => [c.player_id, c]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const maxYear = Math.max(...seasons.map((s) => s.season_year));
  const valuationYears = getValuationSeasonYears(maxYear);
  const ratesByPosition = buildTierRatesByPosition(config, seasons, valuationYears);
  const seasonPab = buildPlayerSeasonPab(seasons, config, ratesByPosition);
  const seasonMap = toSeasonPabMap(seasonPab);
  const playerMeta = buildPlayerMeta(careers, seasonMap, playerById);
  const careerInputs = buildPlayerCareers(seasonMap, playerMeta);

  const completeIds = new Set<number>();
  for (const career of careers) {
    if (
      isCareerComplete(career.last_season, recentPlayers.has(career.player_id))
    ) {
      completeIds.add(career.player_id);
    }
  }

  const trainingCareers = careerInputs.filter(
    (career) => completeIds.has(career.playerId) && career.seasons.size >= 2,
  );
  const trainingCheckpoints = buildAllCheckpoints(trainingCareers);
  const models = trainProjectionModels(trainingCheckpoints);
  const compPool = trainingCheckpoints.map(checkpointToCompCandidate);
  const positionMedians = buildPositionMedianLengths(trainingCareers);

  const projections = new Map<number, PlayerProjection>();
  let activeProjected = 0;
  let skippedRookies = 0;

  for (const career of careerInputs) {
    if (completeIds.has(career.playerId)) continue;

    const careerMeta = careerById.get(career.playerId);
    const seasonsPlayed = career.seasons.size;
    if (seasonsPlayed < 1) continue;

    if (
      isCurrentRookie(
        seasonsPlayed,
        careerMeta?.first_season ?? null,
        careerMeta?.last_season ?? null,
      )
    ) {
      skippedRookies += 1;
      continue;
    }

    const estimatedTotal = estimateTotalSeasons(
      positionMedians,
      career.position,
      seasonsPlayed,
    );
    const checkpoint = buildActiveProjectionCheckpoint(career, estimatedTotal);
    if (!checkpoint) continue;

    const rates = ratesByPosition.get(career.position)!;
    const result = predictCheckpointTuned(models, compPool, checkpoint, rates);
    const value = buildCareerValue(
      career.position,
      realizedTierCounts(career),
      result.predictedTiers,
      rates,
    );

    projections.set(career.playerId, {
      ...value,
      playerId: career.playerId,
      yearsPlayed: checkpoint.yearsPlayed,
      careerQuartile: careerQuartile(checkpoint.yearsPlayed, estimatedTotal),
      compSampleSize: result.compSampleSize,
      compMatchType: result.compMatchType,
    });
    activeProjected += 1;
  }

  return {
    projections,
    summary: {
      trainingCareers: trainingCareers.length,
      trainingCheckpoints: trainingCheckpoints.length,
      activeProjected,
      skippedRookies,
    },
  };
}

export function getPlayerProjection(
  result: CareerProjectionResult,
  playerId: number,
): PlayerProjection | null {
  return result.projections.get(playerId) ?? null;
}
