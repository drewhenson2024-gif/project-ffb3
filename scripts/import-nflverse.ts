import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizePlayerName } from "../src/lib/normalize-name";
import {
  DRAFT_START,
  SEASON_END,
  SEASON_START,
  draftPicksUrl,
  halfPprPoints,
  isSkillPosition,
  resolveExternalId,
  seasonStatsUrl,
  type SkillPosition,
} from "./lib/nflverse";

config({ path: path.resolve(process.cwd(), ".env.local") });

const CACHE_DIR = path.resolve(process.cwd(), "data", "cache");
const BATCH_SIZE = 500;

type DraftRow = {
  season: string;
  round: string;
  pick: string;
  team: string;
  gsis_id: string;
  pfr_player_id: string;
  pfr_player_name: string;
  position: string;
  college: string;
};

type StatsRow = {
  player_id: string;
  player_name: string;
  player_display_name: string;
  position: string;
  season: string;
  recent_team: string;
  games: string;
  completions: string;
  attempts: string;
  passing_yards: string;
  passing_tds: string;
  passing_interceptions: string;
  carries: string;
  rushing_yards: string;
  rushing_tds: string;
  rushing_fumbles_lost: string;
  receptions: string;
  targets: string;
  receiving_yards: string;
  receiving_tds: string;
  receiving_fumbles_lost: string;
  fantasy_points: string;
  fantasy_points_ppr: string;
};

type PlayerSeed = {
  externalId: string;
  displayName: string;
  fullName: string;
  nameKey: string;
  suffix: string | null;
  primaryPosition: SkillPosition;
  pfrPlayerId: string | null;
  debutSeason: number | null;
  finalSeason: number | null;
  draftYear: number | null;
};

function num(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statInt(value: string | undefined): number {
  return Math.max(0, Math.round(num(value)));
}

async function loadPlayerIdMap(
  supabase: ReturnType<typeof createClient>,
): Promise<Map<string, number>> {
  const idByExternal = new Map<string, number>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("players")
      .select("id, external_id")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data as Array<{ id: number; external_id: string }>) {
      idByExternal.set(row.external_id, row.id);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return idByExternal;
}

async function downloadCsv(url: string, filename: string): Promise<string> {
  const filePath = path.join(CACHE_DIR, filename);
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    console.log(`Downloading ${url}...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.status}`);
    }
    const text = await response.text();
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(filePath, text, "utf8");
    return text;
  }
}

async function clearDatabase(supabase: ReturnType<typeof createClient>) {
  console.log("Clearing existing imported data...");
  const steps = [
    () => supabase.from("player_career_stats").delete().gte("player_id", 0),
    () => supabase.from("fantasy_season_stats").delete().gte("id", 0),
    () => supabase.from("draft_picks").delete().gte("id", 0),
    () => supabase.from("players").delete().gte("id", 0),
  ];

  for (const step of steps) {
    const { error } = await step();
    if (error) throw error;
  }
}

async function batchInsert<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: T[],
) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
    console.log(`  ${table}: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  }

  const supabase = createClient(supabaseUrl, secretKey);
  const players = new Map<string, PlayerSeed>();
  const everDraftedIds = new Set<string>();

  console.log("Loading nflverse draft picks...");
  const draftCsv = await downloadCsv(draftPicksUrl(), "draft_picks.csv");
  const draftRows = parse(draftCsv, {
    columns: true,
    skip_empty_lines: true,
  }) as DraftRow[];

  for (const row of draftRows) {
    if (!isSkillPosition(row.position)) continue;

    const externalId = resolveExternalId(row.gsis_id, row.pfr_player_id);
    if (!externalId) continue;

    everDraftedIds.add(externalId);

    const draftYear = num(row.season);
    const normalized = normalizePlayerName(row.pfr_player_name);
    const existing = players.get(externalId);

    players.set(externalId, {
      externalId,
      displayName: normalized.displayName,
      fullName: normalized.fullName,
      nameKey: normalized.nameKey,
      suffix: normalized.suffix,
      primaryPosition: row.position as SkillPosition,
      pfrPlayerId: row.pfr_player_id || null,
      debutSeason: existing?.debutSeason ?? null,
      finalSeason: existing?.finalSeason ?? null,
      draftYear: draftYear >= DRAFT_START ? draftYear : (existing?.draftYear ?? null),
    });
  }

  const seasonStatRows: Array<Record<string, unknown>> = [];

  for (let season = SEASON_START; season <= SEASON_END; season++) {
    console.log(`Loading ${season} season stats...`);
    const statsCsv = await downloadCsv(
      seasonStatsUrl(season),
      `stats_player_reg_${season}.csv`,
    );
    const rows = parse(statsCsv, {
      columns: true,
      skip_empty_lines: true,
    }) as StatsRow[];

    for (const row of rows) {
      if (!isSkillPosition(row.position)) continue;

      const externalId = row.player_id?.trim();
      if (!externalId) continue;

      const normalized = normalizePlayerName(
        row.player_display_name || row.player_name,
      );
      const existing = players.get(externalId);

      players.set(externalId, {
        externalId,
        displayName: normalized.displayName,
        fullName: normalized.fullName,
        nameKey: normalized.nameKey,
        suffix: normalized.suffix,
        primaryPosition: row.position as SkillPosition,
        pfrPlayerId: existing?.pfrPlayerId ?? null,
        debutSeason: existing?.debutSeason
          ? Math.min(existing.debutSeason, season)
          : season,
        finalSeason: existing?.finalSeason
          ? Math.max(existing.finalSeason, season)
          : season,
        draftYear: existing?.draftYear ?? null,
      });

      const fantasyStandard = num(row.fantasy_points);
      const fantasyPpr = num(row.fantasy_points_ppr);

      seasonStatRows.push({
        _external_id: externalId,
        season_year: season,
        position: row.position,
        team: row.recent_team || null,
        games_played: statInt(row.games),
        games_started: 0,
        pass_attempts: statInt(row.attempts),
        pass_completions: statInt(row.completions),
        pass_yards: statInt(row.passing_yards),
        pass_touchdowns: statInt(row.passing_tds),
        interceptions: statInt(row.passing_interceptions),
        rush_attempts: statInt(row.carries),
        rush_yards: statInt(row.rushing_yards),
        rush_touchdowns: statInt(row.rushing_tds),
        targets: statInt(row.targets),
        receptions: statInt(row.receptions),
        receiving_yards: statInt(row.receiving_yards),
        receiving_touchdowns: statInt(row.receiving_tds),
        fumbles_lost:
          statInt(row.rushing_fumbles_lost) + statInt(row.receiving_fumbles_lost),
        fantasy_points_standard: fantasyStandard,
        fantasy_points_ppr: fantasyPpr,
        fantasy_points_half_ppr: halfPprPoints(
          fantasyStandard,
          statInt(row.receptions),
        ),
      });
    }
  }

  await clearDatabase(supabase);

  const duplicateNameKeys = new Map<string, number>();
  for (const player of players.values()) {
    duplicateNameKeys.set(
      player.nameKey,
      (duplicateNameKeys.get(player.nameKey) ?? 0) + 1,
    );
  }

  const playerRows = [...players.values()].map((player) => {
    const isUndrafted = !everDraftedIds.has(player.externalId);

    return {
      external_id: player.externalId,
      full_name: player.fullName,
      display_name: player.displayName,
      name_key: player.nameKey,
      suffix: player.suffix,
      primary_position: player.primaryPosition,
      pfr_player_id: player.pfrPlayerId,
      is_undrafted: isUndrafted,
      debut_season: player.debutSeason,
      final_season: player.finalSeason,
    };
  });

  console.log(`Inserting ${playerRows.length} players...`);
  await batchInsert(supabase, "players", playerRows);

  const idByExternal = await loadPlayerIdMap(supabase);
  console.log(`  Resolved ${idByExternal.size} player IDs for linking`);

  const draftInsertRows = draftRows
    .filter((row) => {
      const year = num(row.season);
      return year >= DRAFT_START && isSkillPosition(row.position);
    })
    .map((row) => {
      const externalId = resolveExternalId(row.gsis_id, row.pfr_player_id);
      const playerId = externalId ? idByExternal.get(externalId) : undefined;
      if (!playerId) return null;

      return {
        player_id: playerId,
        draft_year: num(row.season),
        round: num(row.round),
        pick_overall: num(row.pick),
        drafting_team: row.team,
        position: row.position,
        college: row.college || null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  // Rare cases: same player drafted twice (e.g. Bo Jackson 1986 + 1987 supplemental)
  const draftByPlayerId = new Map<
    number,
    (typeof draftInsertRows)[number]
  >();
  for (const row of draftInsertRows) {
    const existing = draftByPlayerId.get(row.player_id);
    if (
      !existing ||
      row.draft_year < existing.draft_year ||
      (row.draft_year === existing.draft_year &&
        row.pick_overall < existing.pick_overall)
    ) {
      draftByPlayerId.set(row.player_id, row);
    }
  }
  const uniqueDraftRows = [...draftByPlayerId.values()];

  if (uniqueDraftRows.length < draftInsertRows.length) {
    console.log(
      `  Deduped ${draftInsertRows.length - uniqueDraftRows.length} duplicate draft entries`,
    );
  }

  console.log(`Inserting ${uniqueDraftRows.length} draft picks (${DRAFT_START}+)...`);
  await batchInsert(supabase, "draft_picks", uniqueDraftRows);

  const fantasyInsertRows = seasonStatRows
    .map((row) => {
      const externalId = row._external_id as string;
      const playerId = idByExternal.get(externalId);
      if (!playerId) return null;
      const { _external_id: _, ...rest } = row;
      return { player_id: playerId, ...rest };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  console.log(`Inserting ${fantasyInsertRows.length} season stat rows...`);
  await batchInsert(supabase, "fantasy_season_stats", fantasyInsertRows);

  console.log("Refreshing career stats...");
  const { error: refreshError } = await supabase.rpc(
    "refresh_player_career_stats",
  );
  if (refreshError) {
    console.log(
      `  RPC refresh failed (${refreshError.message}). Run migration 005 or execute: select refresh_player_career_stats();`,
    );
  }

  const undraftedWithStats = [...players.values()].filter(
    (p) => !everDraftedIds.has(p.externalId) && p.debutSeason !== null,
  ).length;

  console.log("\nImport complete.");
  console.log(`  Players:              ${playerRows.length}`);
  console.log(`  Draft picks (${DRAFT_START}+): ${uniqueDraftRows.length}`);
  console.log(`  Season stat rows:     ${fantasyInsertRows.length}`);
  console.log(`  Verified undrafted:   ${undraftedWithStats}`);
  const duplicateGroups = [...duplicateNameKeys.entries()].filter(
    ([, count]) => count > 1,
  ).length;
  console.log(`  Duplicate name keys:  ${duplicateGroups}`);
  if (duplicateGroups > 0) {
    console.log(
      "  Tip: disambiguate duplicates by external_id (gsis_id), draft_year, or debut_season.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
