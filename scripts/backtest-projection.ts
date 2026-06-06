/**
 * Backtest career projection: sweep cutoffs, quartile models, regression/comp blends.
 * Run: npm run backtest:projection
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";
import {
  careerPabFromTierCounts,
  toValuableTierPab,
  type TierPabRates,
} from "../src/lib/valuation/career-pab";
import {
  buildAllCheckpoints,
  buildPlayerCareers,
  type PlayerCareerInput,
  type ProjectionCheckpoint,
} from "../src/lib/valuation/checkpoints";
import {
  CAREER_QUARTILE_LABELS,
  type CareerQuartile,
} from "../src/lib/valuation/career-stage";
import { checkpointToCompCandidate } from "../src/lib/valuation/projection-predict";
import { trainProjectionModels } from "../src/lib/valuation/projection-models";
import { predictCheckpoint } from "../src/lib/valuation/projection-predict";
import { isCareerComplete, recentSeasonYears } from "../src/lib/valuation/career-complete";
import { getValuationSeasonYears } from "../src/lib/valuation/pab";
import {
  buildPlayerSeasonPab,
  buildTierRatesByPosition,
  type CareerMeta,
  type SeasonStatRow,
} from "../src/lib/valuation/player-profiles";
import { DEFAULT_LEAGUE_CONFIG, type LeagueConfig } from "../src/lib/valuation/types";
import type { Position } from "../src/types/database";

config({ path: path.resolve(process.cwd(), ".env.local") });

const PAGE_SIZE = 1000;
const LEAGUE = DEFAULT_LEAGUE_CONFIG;
const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];
const BLENDS = [0, 0.25, 0.5, 0.75, 1] as const;
const TRAIN_FRACTION = 0.8;

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

function section(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

function splitPlayers(playerIds: number[]): { train: Set<number>; test: Set<number> } {
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

type ErrorBucket = {
  errors: number[];
  count: number;
};

function bucketKey(position: Position, quartile: CareerQuartile, blend: number): string {
  return `${position}-Q${quartile}-blend${blend}`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const supabase = createClient(url, key);

  section("Loading data");
  const [seasons, careers, players] = await Promise.all([
    fetchAll<SeasonStatRow>(supabase, "fantasy_season_stats", "player_id, season_year, position, fantasy_points_ppr, fantasy_points_half_ppr, fantasy_points_standard, games_played"),
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
            { tier: entry.tier, games: entry.games, position: entry.position },
          ]),
        ),
      ]),
    ),
    playerMeta,
  ).filter((career) => completeIds.has(career.playerId) && career.seasons.size >= 2);

  const allCheckpoints = buildAllCheckpoints(careerInputs);
  const { train, test } = splitPlayers(careerInputs.map((c) => c.playerId));

  const trainCheckpoints = allCheckpoints.filter((row) => train.has(row.playerId));
  const models = trainProjectionModels(trainCheckpoints);

  section("Training summary");
  console.log(`Completed careers: ${careerInputs.length}`);
  console.log(`Checkpoints: ${allCheckpoints.length} (train ${trainCheckpoints.length})`);
  console.log(`League: ${LEAGUE.teams} teams, ${LEAGUE.scoring}`);

  const errorsByKey = new Map<string, ErrorBucket>();
  const errorsByCutoff = new Map<number, ErrorBucket>();
  let totalPredictions = 0;

  for (const career of careerInputs.filter((c) => test.has(c.playerId))) {
    const totalSeasons = career.seasons.size;
    const rates = ratesByPosition.get(career.position)!;

    for (let yearsPlayed = 1; yearsPlayed < totalSeasons; yearsPlayed++) {
      const checkpoint = allCheckpoints.find(
        (row) => row.playerId === career.playerId && row.yearsPlayed === yearsPlayed,
      );
      if (!checkpoint) continue;

      const compPool = trainCheckpoints
        .filter((row) => row.playerId !== career.playerId)
        .map(checkpointToCompCandidate);

      const actual = actualRemainingPab(checkpoint, rates);

      for (const compWeight of BLENDS) {
        const result = predictCheckpoint(models, compPool, checkpoint, rates, {
          compWeight,
        });
        const error = Math.abs(result.predictedPab - actual);
        totalPredictions += 1;

        const key = bucketKey(
          checkpoint.position,
          checkpoint.careerQuartile,
          compWeight,
        );
        const bucket = errorsByKey.get(key) ?? { errors: [], count: 0 };
        bucket.errors.push(error);
        bucket.count += 1;
        errorsByKey.set(key, bucket);

        const cutoffBucket = errorsByCutoff.get(yearsPlayed) ?? { errors: [], count: 0 };
        cutoffBucket.errors.push(error);
        cutoffBucket.count += 1;
        errorsByCutoff.set(yearsPlayed, cutoffBucket);
      }
    }
  }

  section("MAE by career quartile and blend (test set)");
  console.log("position | quartile   | blend | MAE (PAB) | n");
  for (const position of POSITIONS) {
    for (const quartile of [1, 2, 3, 4] as CareerQuartile[]) {
      let bestBlend = 0;
      let bestMae = Infinity;
      for (const blend of BLENDS) {
        const bucket = errorsByKey.get(bucketKey(position, quartile, blend));
        if (!bucket?.count) continue;
        const mae = bucket.errors.reduce((a, b) => a + b, 0) / bucket.errors.length;
        if (mae < bestMae) {
          bestMae = mae;
          bestBlend = blend;
        }
      }
      for (const blend of BLENDS) {
        const bucket = errorsByKey.get(bucketKey(position, quartile, blend));
        if (!bucket?.count) continue;
        const mae = bucket.errors.reduce((a, b) => a + b, 0) / bucket.errors.length;
        const marker = blend === bestBlend ? " ← best" : "";
        console.log(
          `${position.padEnd(8)} | Q${quartile} ${CAREER_QUARTILE_LABELS[quartile].padEnd(8)} | ${String(blend).padEnd(4)} | ${mae.toFixed(1).padStart(9)} | ${bucket.count}${marker}`,
        );
      }
    }
  }

  section("Best blend per position × quartile");
  const recommended: Record<string, number> = {};
  for (const position of POSITIONS) {
    for (const quartile of [1, 2, 3, 4] as CareerQuartile[]) {
      let bestBlend = 0.5;
      let bestMae = Infinity;
      for (const blend of BLENDS) {
        const bucket = errorsByKey.get(bucketKey(position, quartile, blend));
        if (!bucket?.count) continue;
        const mae = bucket.errors.reduce((a, b) => a + b, 0) / bucket.errors.length;
        if (mae < bestMae) {
          bestMae = mae;
          bestBlend = blend;
        }
      }
      const key = `${position}-Q${quartile}`;
      recommended[key] = bestBlend;
      console.log(
        `${key}: compWeight=${bestBlend} (${Math.round(bestBlend * 100)}% comp / ${Math.round((1 - bestBlend) * 100)}% regression), MAE≈${bestMae.toFixed(1)}`,
      );
    }
  }

  section("MAE by years played at cutoff (all blends averaged)");
  const cutoffs = [...errorsByCutoff.keys()].sort((a, b) => a - b);
  for (const yearsPlayed of cutoffs) {
    const bucket = errorsByCutoff.get(yearsPlayed)!;
    const mae = bucket.errors.reduce((a, b) => a + b, 0) / bucket.errors.length;
    console.log(`  After year ${String(yearsPlayed).padStart(2)}: MAE ${mae.toFixed(1)} (n=${bucket.count / BLENDS.length})`);
  }

  section("Summary");
  console.log(`Total predictions evaluated: ${totalPredictions}`);
  console.log("Comp matching: tight first, loose if < 5 matches.");
  console.log("Models: separate OLS per position × career quartile (fallback to position-wide).");
  console.log("Recommended blends saved above for production engine.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
