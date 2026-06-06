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
import {
  buildActiveProjectionCheckpoint,
  buildAllCheckpoints,
  buildPlayerCareers,
  type PlayerCareerInput,
  type SeasonEntry,
} from "./checkpoints";
import {
  calibrateRemainingPab,
  buildDynastyLookup,
  normalizePlayerName,
} from "./dynasty-calibration";
import { loadDynastyRankings } from "./load-dynasty-rankings";
import { PROJECTION_CONFIG } from "./projection-config";
import { estimateActiveCareerTotal } from "./career-stage";
import { computeRecentPerformance } from "./recent-performance";
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
          {
            tier: entry.tier,
            games: entry.games,
            position: entry.position,
            pab: entry.pab,
          },
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

  const useDynasty = PROJECTION_CONFIG.dynastyCalibrationWeight > 0;
  const dynastyFile = useDynasty ? await loadDynastyRankings() : null;
  const dynastyByName = dynastyFile ? buildDynastyLookup(dynastyFile) : new Map();

  const projections = new Map<number, PlayerProjection>();
  const modelRemainingByPosition = new Map<Position, number[]>();
  let activeProjected = 0;
  let skippedRookies = 0;

  const pending: Array<{
    career: PlayerCareerInput;
    checkpoint: NonNullable<ReturnType<typeof buildActiveProjectionCheckpoint>>;
    result: ReturnType<typeof predictCheckpointTuned>;
    rates: import("./career-pab").TierPabRates;
  }> = [];

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

    const sortedYears = [...career.seasons.keys()].sort((a, b) => a - b);
    const tiersSoFar = realizedTierCounts(career);
    const lastYear = sortedYears[sortedYears.length - 1];
    const recent = computeRecentPerformance(sortedYears, career.seasons, tiersSoFar);
    let peakTier = 0;
    for (const entry of career.seasons.values()) {
      peakTier = Math.max(
        peakTier,
        entry.tier === "elite"
          ? 4
          : entry.tier === "star"
            ? 3
            : entry.tier === "starter"
              ? 2
              : entry.tier === "bench"
                ? 1
                : 0,
      );
    }

    const estimatedTotal = estimateActiveCareerTotal(
      positionMedians,
      career.position,
      seasonsPlayed,
      {
        peakTier,
        recent,
        ageProxy: career.draftYear ? lastYear - career.draftYear + 22 : null,
        tiersSoFar,
      },
    );
    const checkpoint = buildActiveProjectionCheckpoint(career, estimatedTotal);
    if (!checkpoint) continue;

    const rates = ratesByPosition.get(career.position)!;
    const result = predictCheckpointTuned(models, compPool, checkpoint, rates);
    const modelRemaining = result.predictedPab;

    const peers = modelRemainingByPosition.get(career.position) ?? [];
    peers.push(modelRemaining);
    modelRemainingByPosition.set(career.position, peers);

    pending.push({ career, checkpoint, result, rates });
    activeProjected += 1;
  }

  const { data: nameRows } = await supabase
    .from("player_profiles")
    .select("player_id, full_name")
    .in(
      "player_id",
      pending.map((row) => row.career.playerId),
    );
  const nameById = new Map(
    (nameRows ?? []).map((row) => [row.player_id, row.full_name as string]),
  );

  for (const row of pending) {
    const { career, checkpoint, result, rates } = row;
    const modelRemaining = result.predictedPab;
    const peerRemaining = modelRemainingByPosition.get(career.position) ?? [];
    const playerName = normalizePlayerName(
      nameById.get(career.playerId) ?? "",
    );
    const dynastyEntry = dynastyByName.get(playerName);
    const calibratedRemaining = useDynasty
      ? calibrateRemainingPab(
          modelRemaining,
          dynastyEntry?.positionRank ?? null,
          peerRemaining,
        )
      : modelRemaining;
    const scale =
      modelRemaining > 0 ? calibratedRemaining / modelRemaining : 1;
    const calibratedTiers = {
      elite: result.predictedTiers.elite * scale,
      star: result.predictedTiers.star * scale,
      starter: result.predictedTiers.starter * scale,
    };

    const value = buildCareerValue(
      career.position,
      realizedTierCounts(career),
      calibratedTiers,
      rates,
    );

    projections.set(career.playerId, {
      ...value,
      playerId: career.playerId,
      yearsPlayed: checkpoint.yearsPlayed,
      careerQuartile: checkpoint.careerQuartile,
      compSampleSize: result.compSampleSize,
      compMatchType: result.compMatchType,
    });
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
