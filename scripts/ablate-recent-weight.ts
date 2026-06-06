/**
 * Sweep recent-feature scale vs backtest MAE (no dynasty calibration).
 * Run: npm run ablate:recent
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";
import {
  careerPabFromTierCounts,
  type TierPabRates,
} from "../src/lib/valuation/career-pab";
import {
  buildAllCheckpoints,
  buildPlayerCareers,
  type ProjectionCheckpoint,
} from "../src/lib/valuation/checkpoints";
import { isCareerComplete, recentSeasonYears } from "../src/lib/valuation/career-complete";
import { getValuationSeasonYears } from "../src/lib/valuation/pab";
import {
  buildPlayerSeasonPab,
  buildTierRatesByPosition,
  type CareerMeta,
  type SeasonStatRow,
} from "../src/lib/valuation/player-profiles";
import {
  checkpointToCompCandidate,
  predictCheckpointTuned,
} from "../src/lib/valuation/projection-predict";
import { trainProjectionModels } from "../src/lib/valuation/projection-models";
import { DEFAULT_LEAGUE_CONFIG } from "../src/lib/valuation/types";
import type { Position } from "../src/types/database";

config({ path: path.resolve(process.cwd(), ".env.local") });

const PAGE_SIZE = 1000;
const LEAGUE = DEFAULT_LEAGUE_CONFIG;
const TRAIN_FRACTION = 0.8;
const SCALES = [0, 0.25, 0.4, 0.5, 0.75, 1] as const;

type PlayerRow = {
  id: number;
  is_undrafted: boolean;
  primary_position: Position;
};

async function fetchAll<T>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  select: string,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function splitPlayers(playerIds: number[]) {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const trainSize = Math.floor(shuffled.length * TRAIN_FRACTION);
  return {
    train: new Set(shuffled.slice(0, trainSize)),
    test: new Set(shuffled.slice(trainSize)),
  };
}

function actualRemainingPab(
  checkpoint: ProjectionCheckpoint,
  rates: TierPabRates,
): number {
  return careerPabFromTierCounts(checkpoint.remainingTiers, rates);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const supabase = createClient(url, key);
  const [seasons, careers, players] = await Promise.all([
    fetchAll<SeasonStatRow>(
      supabase,
      "fantasy_season_stats",
      "player_id, season_year, position, fantasy_points_ppr, fantasy_points_half_ppr, fantasy_points_standard, games_played",
    ),
    fetchAll<CareerMeta & { first_season: number | null }>(
      supabase,
      "player_career_stats",
      "player_id, draft_year, draft_pick_overall, draft_position, last_season, first_season",
    ),
    fetchAll<PlayerRow>(supabase, "players", "id, is_undrafted, primary_position"),
  ]);

  const recent = new Set(recentSeasonYears());
  const recentPlayers = new Set<number>();
  for (const row of seasons) {
    if (recent.has(row.season_year)) recentPlayers.add(row.player_id);
  }

  const completeIds = new Set(
    careers
      .filter((c) => isCareerComplete(c.last_season, recentPlayers.has(c.player_id)))
      .map((c) => c.player_id),
  );

  const playerById = new Map(players.map((p) => [p.id, p]));
  const years = getValuationSeasonYears(Math.max(...seasons.map((s) => s.season_year)));
  const ratesByPosition = buildTierRatesByPosition(LEAGUE, seasons, years);
  const seasonPab = buildPlayerSeasonPab(seasons, LEAGUE, ratesByPosition);

  const playerMeta = new Map<
    number,
    {
      position: Position;
      isUndrafted: boolean;
      draftPick: number | null;
      draftYear: number | null;
    }
  >();

  for (const career of careers) {
    if (!completeIds.has(career.player_id)) continue;
    const player = playerById.get(career.player_id);
    const seasonMap = seasonPab.get(career.player_id);
    if (!seasonMap) continue;

    const position =
      career.draft_position ??
      player?.primary_position ??
      [...seasonMap.values()][0]?.position ??
      "WR";

    playerMeta.set(career.player_id, {
      position,
      isUndrafted: player?.is_undrafted ?? !career.draft_pick_overall,
      draftPick: career.draft_pick_overall,
      draftYear: career.draft_year,
    });
  }

  const careerInputs = buildPlayerCareers(
    new Map(
      [...seasonPab.entries()].map(([id, map]) => [
        id,
        new Map(
          [...map.entries()].map(([year, entry]) => [
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
    ),
    playerMeta,
  ).filter((career) => completeIds.has(career.playerId) && career.seasons.size >= 2);

  const allCheckpoints = buildAllCheckpoints(careerInputs);
  const { train, test } = splitPlayers(careerInputs.map((c) => c.playerId));
  const trainCheckpoints = allCheckpoints.filter((row) => train.has(row.playerId));
  const testCareers = careerInputs.filter((c) => test.has(c.playerId));

  console.log("Recent-feature scale ablation (tuned comp blend, no dynasty)\n");
  console.log("scale | overall MAE | QB MAE | RB MAE | WR MAE | TE MAE");
  console.log("-".repeat(62));

  let bestScale = SCALES[0];
  let bestMae = Infinity;

  for (const scale of SCALES) {
    const models = trainProjectionModels(trainCheckpoints, scale);
    const compPool = trainCheckpoints.map(checkpointToCompCandidate);
    const errorsByPos = new Map<Position, number[]>();
    const allErrors: number[] = [];

    for (const career of testCareers) {
      const rates = ratesByPosition.get(career.position)!;
      for (let yearsPlayed = 1; yearsPlayed < career.seasons.size; yearsPlayed++) {
        const checkpoint = allCheckpoints.find(
          (row) => row.playerId === career.playerId && row.yearsPlayed === yearsPlayed,
        );
        if (!checkpoint) continue;

        const pool = compPool.filter((row) => row.playerId !== career.playerId);
        const result = predictCheckpointTuned(models, pool, checkpoint, rates);
        const actual = actualRemainingPab(checkpoint, rates);
        const error = Math.abs(result.predictedPab - actual);
        allErrors.push(error);
        const bucket = errorsByPos.get(career.position) ?? [];
        bucket.push(error);
        errorsByPos.set(career.position, bucket);
      }
    }

    const mae = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const overall = mae(allErrors);
    if (overall < bestMae) {
      bestMae = overall;
      bestScale = scale;
    }

    const posMae = (p: Position) => mae(errorsByPos.get(p) ?? []).toFixed(1);
    console.log(
      `${String(scale).padEnd(5)} | ${overall.toFixed(1).padStart(11)} | ${posMae("QB").padStart(6)} | ${posMae("RB").padStart(6)} | ${posMae("WR").padStart(6)} | ${posMae("TE").padStart(6)}`,
    );
  }

  console.log(`\nBest scale by overall MAE: ${bestScale} (MAE ${bestMae.toFixed(1)})`);
  console.log("Set projection-config.ts recentFeatureScale to this value.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
