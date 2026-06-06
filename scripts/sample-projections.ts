/**
 * Print sample active career projections and backtest-style examples.
 * Run: npm run sample:projections
 */
import { config } from "dotenv";
import path from "node:path";
import { createServerClient } from "../src/lib/supabase/server";
import { CAREER_QUARTILE_LABELS } from "../src/lib/valuation/career-stage";
import {
  buildAllCheckpoints,
  buildPlayerCareers,
  type PlayerCareerInput,
} from "../src/lib/valuation/checkpoints";
import { careerPabFromTierCounts } from "../src/lib/valuation/career-pab";
import { isCareerComplete, recentSeasonYears } from "../src/lib/valuation/career-complete";
import { checkpointToCompCandidate } from "../src/lib/valuation/projection-predict";
import { predictCheckpointTuned } from "../src/lib/valuation/projection-predict";
import { trainProjectionModels } from "../src/lib/valuation/projection-models";
import { getValuationSeasonYears } from "../src/lib/valuation/pab";
import {
  buildPlayerSeasonPab,
  buildTierRatesByPosition,
} from "../src/lib/valuation/player-profiles";
import { runCareerProjections } from "../src/lib/valuation/run-career-projections";
import { DEFAULT_LEAGUE_CONFIG } from "../src/lib/valuation/types";
import type { Position } from "../src/types/database";

config({ path: path.resolve(process.cwd(), ".env.local") });

function section(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

async function main() {
  const supabase = createServerClient();
  const { projections, summary } = await runCareerProjections(
    supabase,
    DEFAULT_LEAGUE_CONFIG,
  );

  section("Production engine (active players today)");
  console.log(summary);

  const topActive = [...projections.values()]
    .sort((a, b) => b.totalCareerPab - a.totalCareerPab)
    .slice(0, 6);
  const activeIds = topActive.map((p) => p.playerId);

  const { data: activeProfiles } = await supabase
    .from("player_profiles")
    .select("player_id, full_name, primary_position, seasons_played, draft_year")
    .in("player_id", activeIds);

  const activeById = new Map(
    (activeProfiles ?? []).map((p) => [p.player_id, p]),
  );

  section("Top active projections (what /players and /valuation show)");
  for (const p of topActive) {
    const prof = activeById.get(p.playerId);
    const name = prof?.full_name ?? `id:${p.playerId}`;
    console.log(`\n${name} (${prof?.primary_position ?? p.position}, ${prof?.seasons_played ?? p.yearsPlayed} seasons)`);
    console.log(
      `  Q${p.careerQuartile} ${CAREER_QUARTILE_LABELS[p.careerQuartile]} · ${p.compMatchType} comps (n=${p.compSampleSize})`,
    );
    console.log(
      `  Realized ${p.realizedPab.toFixed(0)} PAB · Projected ${p.projectedRemainingPab.toFixed(0)} · Total ${p.totalCareerPab.toFixed(0)}`,
    );
    console.log(
      `  Remaining tiers: ${p.projectedRemainingCounts.elite.toFixed(1)} elite, ${p.projectedRemainingCounts.star.toFixed(1)} star, ${p.projectedRemainingCounts.starter.toFixed(1)} starter`,
    );
  }

  section("Backtest-style examples (completed careers — predict vs actual)");
  console.log(
    "Same logic as npm run backtest:projection, but showing a few named players at a mid-career cutoff.\n",
  );

  const PAGE = 1000;
  async function fetchAll<T>(table: string, select: string): Promise<T[]> {
    const rows: T[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...(data as T[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  }

  type SeasonRow = {
    player_id: number;
    season_year: number;
    position: Position;
    fantasy_points_ppr: number;
    fantasy_points_half_ppr: number;
    fantasy_points_standard: number;
    games_played?: number;
  };

  const [seasons, careers, players] = await Promise.all([
    fetchAll<SeasonRow>(
      "fantasy_season_stats",
      "player_id, season_year, position, fantasy_points_ppr, fantasy_points_half_ppr, fantasy_points_standard, games_played",
    ),
    fetchAll<{
      player_id: number;
      draft_year: number | null;
      draft_pick_overall: number | null;
      draft_position: Position | null;
      last_season: number | null;
    }>(
      "player_career_stats",
      "player_id, draft_year, draft_pick_overall, draft_position, last_season",
    ),
    fetchAll<{ id: number; is_undrafted: boolean; primary_position: Position }>(
      "players",
      "id, is_undrafted, primary_position",
    ),
  ]);

  const recent = new Set(recentSeasonYears());
  const recentPlayers = new Set<number>();
  for (const row of seasons) {
    if (recent.has(row.season_year)) recentPlayers.add(row.player_id);
  }

  const completeIds = new Set(
    careers
      .filter((c) =>
        isCareerComplete(c.last_season, recentPlayers.has(c.player_id)),
      )
      .map((c) => c.player_id),
  );

  const playerById = new Map(players.map((p) => [p.id, p]));
  const careerById = new Map(careers.map((c) => [c.player_id, c]));
  const maxYear = Math.max(...seasons.map((s) => s.season_year));
  const years = getValuationSeasonYears(maxYear);
  const ratesByPosition = buildTierRatesByPosition(
    DEFAULT_LEAGUE_CONFIG,
    seasons,
    years,
  );
  const seasonPab = buildPlayerSeasonPab(
    seasons,
    DEFAULT_LEAGUE_CONFIG,
    ratesByPosition,
  );

  const playerMeta = new Map<
    number,
    {
      position: Position;
      isUndrafted: boolean;
      draftPick: number | null;
      draftYear: number | null;
    }
  >();

  for (const [playerId, seasonMap] of seasonPab) {
    if (!completeIds.has(playerId) || !seasonMap.size) continue;
    const career = careerById.get(playerId);
    const player = playerById.get(playerId);
    const position =
      career?.draft_position ??
      player?.primary_position ??
      [...seasonMap.values()][0]?.position ??
      "WR";
    playerMeta.set(playerId, {
      position,
      isUndrafted: player?.is_undrafted ?? !career?.draft_pick_overall,
      draftPick: career?.draft_pick_overall ?? null,
      draftYear: career?.draft_year ?? null,
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
  ).filter((c) => completeIds.has(c.playerId) && c.seasons.size >= 4);

  const allCheckpoints = buildAllCheckpoints(careerInputs);
  const models = trainProjectionModels(allCheckpoints);
  const compPool = allCheckpoints.map(checkpointToCompCandidate);

  const { data: completedProfiles } = await supabase
    .from("player_profiles")
    .select("player_id, full_name, primary_position, seasons_played")
    .in(
      "player_id",
      careerInputs.slice(0, 200).map((c) => c.playerId),
    );

  const nameById = new Map(
    (completedProfiles ?? []).map((p) => [p.player_id, p.full_name]),
  );

  const examples: Array<{
    name: string;
    career: PlayerCareerInput;
    yearsPlayed: number;
    predicted: number;
    actual: number;
    error: number;
  }> = [];

  for (const career of careerInputs) {
    const totalSeasons = career.seasons.size;
    const yearsPlayed = Math.max(2, Math.floor(totalSeasons / 2));
    const checkpoint = allCheckpoints.find(
      (row) =>
        row.playerId === career.playerId && row.yearsPlayed === yearsPlayed,
    );
    if (!checkpoint) continue;

    const rates = ratesByPosition.get(career.position)!;
    const result = predictCheckpointTuned(
      models,
      compPool.filter((c) => c.playerId !== career.playerId),
      checkpoint,
      rates,
    );
    const actual = careerPabFromTierCounts(checkpoint.remainingTiers, rates);
    const name = nameById.get(career.playerId) ?? `id:${career.playerId}`;

    examples.push({
      name,
      career,
      yearsPlayed,
      predicted: result.predictedPab,
      actual,
      error: Math.abs(result.predictedPab - actual),
    });
  }

  examples.sort((a, b) => b.career.seasons.size - a.career.seasons.size);

  const picks = [
    examples.find((e) => e.name.includes("Tom Brady")),
    examples.find((e) => e.name.includes("Rob Gronkowski")),
    examples.find((e) => e.name.includes("Larry Fitzgerald")),
    examples.find((e) => e.career.position === "RB" && e.career.seasons.size >= 8),
    examples.find((e) => e.career.position === "WR" && e.actual < 50 && e.predicted > 100),
    examples.find((e) => e.error > 150),
  ].filter(Boolean) as typeof examples;

  const shown = new Set<number>();
  for (const ex of picks) {
    if (shown.has(ex.career.playerId)) continue;
    shown.add(ex.career.playerId);
    console.log(
      `\n${ex.name} (${ex.career.position}) — pretend we're after year ${ex.yearsPlayed} of ${ex.career.seasons.size}`,
    );
    console.log(`  Predicted remaining PAB: ${ex.predicted.toFixed(0)}`);
    console.log(`  Actual remaining PAB:    ${ex.actual.toFixed(0)}`);
    console.log(`  Error:                   ${ex.error.toFixed(0)}`);
  }

  section("How to test yourself");
  console.log("1. Website:  npm run dev  →  /valuation (engine summary) and /players/[id]");
  console.log("2. Samples:  npm run sample:projections  (this script)");
  console.log("3. Backtest: npm run backtest:projection  (full MAE report)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
