import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import {
  DRAFT_START,
  SEASON_END,
  SEASON_START,
  isSkillPosition,
} from "./lib/nflverse";

config({ path: path.resolve(process.cwd(), ".env.local") });

const CACHE_DIR = path.resolve(process.cwd(), "data", "cache");
const PAGE_SIZE = 1000;

type CountRow = { count: number };

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

async function countTable(
  supabase: ReturnType<typeof createClient>,
  table: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) throw error;
  return count ?? 0;
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function countSourceCsvs() {
  const draftCsv = await fs.readFile(
    path.join(CACHE_DIR, "draft_picks.csv"),
    "utf8",
  );
  const draftRows = parse(draftCsv, { columns: true, skip_empty_lines: true }) as Array<{
    season: string;
    position: string;
  }>;

  const draftSkill = draftRows.filter(
    (r) => Number(r.season) >= DRAFT_START && isSkillPosition(r.position),
  ).length;

  const seasonCounts: Record<number, number> = {};
  let totalSeasonRows = 0;

  for (let season = SEASON_START; season <= SEASON_END; season++) {
    const file = path.join(CACHE_DIR, `stats_player_reg_${season}.csv`);
    try {
      const csv = await fs.readFile(file, "utf8");
      const rows = parse(csv, { columns: true, skip_empty_lines: true }) as Array<{
        position: string;
      }>;
      const skill = rows.filter((r) => isSkillPosition(r.position)).length;
      seasonCounts[season] = skill;
      totalSeasonRows += skill;
    } catch {
      seasonCounts[season] = -1;
    }
  }

  return { draftSkill, seasonCounts, totalSeasonRows };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    console.error("Missing Supabase env vars in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  section("Where your data lives");
  console.log("1. Supabase (live database):");
  console.log(`   Dashboard: https://supabase.com/dashboard/project/zsowljeodhwtgcuhzbzv`);
  console.log("   Tables: players, draft_picks, fantasy_season_stats, player_career_stats");
  console.log("   View:   player_profiles");
  console.log("2. Local source cache (nflverse CSVs):");
  console.log(`   ${CACHE_DIR}`);
  console.log("3. Upstream source:");
  console.log("   https://github.com/nflverse/nflverse-data/releases");

  section("Row counts");
  const [players, drafts, seasons, careers] = await Promise.all([
    countTable(supabase, "players"),
    countTable(supabase, "draft_picks"),
    countTable(supabase, "fantasy_season_stats"),
    countTable(supabase, "player_career_stats"),
  ]);

  console.log(`players:               ${players}`);
  console.log(`draft_picks:           ${drafts}`);
  console.log(`fantasy_season_stats:  ${seasons}`);
  console.log(`player_career_stats:   ${careers}`);

  section("Source CSV comparison");
  const source = await countSourceCsvs();
  console.log(`draft_picks.csv (${DRAFT_START}+ skill): ${source.draftSkill}`);
  console.log(`season CSVs (${SEASON_START}-${SEASON_END} skill): ${source.totalSeasonRows}`);
  console.log(
    "Note: DB counts may be lower if draft picks lack matching player stats rows.",
  );

  section("Season coverage in database");
  const seasonRows = await fetchAll<{ season_year: number; position: string }>(
    supabase,
    "fantasy_season_stats",
    "season_year, position",
  );

  const byYear = new Map<number, number>();
  const byYearPos = new Map<string, number>();
  for (const row of seasonRows) {
    byYear.set(row.season_year, (byYear.get(row.season_year) ?? 0) + 1);
    const key = `${row.season_year}-${row.position}`;
    byYearPos.set(key, (byYearPos.get(key) ?? 0) + 1);
  }

  const missingYears: number[] = [];
  for (let y = SEASON_START; y <= SEASON_END; y++) {
    const db = byYear.get(y) ?? 0;
    const csv = source.seasonCounts[y] ?? 0;
    const flag = db === 0 ? "MISSING" : csv > 0 && db < csv * 0.9 ? "LOW" : "ok";
    if (db === 0) missingYears.push(y);
    console.log(
      `  ${y}: db=${db.toString().padStart(4)}  csv=${csv >= 0 ? String(csv).padStart(4) : " n/a"}  [${flag}]`,
    );
  }

  section("Referential integrity");
  const draftRows = await fetchAll<{ player_id: number }>(
    supabase,
    "draft_picks",
    "player_id",
  );
  const seasonPlayerIds = new Set(
    (await fetchAll<{ player_id: number }>(supabase, "fantasy_season_stats", "player_id")).map(
      (r) => r.player_id,
    ),
  );
  const playerIds = new Set(
    (await fetchAll<{ id: number }>(supabase, "players", "id")).map((r) => r.id),
  );

  const orphanDrafts = draftRows.filter((d) => !playerIds.has(d.player_id)).length;
  const draftsWithoutStats = draftRows.filter(
    (d) => !seasonPlayerIds.has(d.player_id),
  ).length;

  console.log(`draft_picks with missing player:     ${orphanDrafts}`);
  console.log(`drafted players with no season stats: ${draftsWithoutStats}`);

  section("Uniqueness constraints");
  const allDrafts = await fetchAll<{
    player_id: number;
    draft_year: number;
    pick_overall: number;
  }>(supabase, "draft_picks", "player_id, draft_year, pick_overall");

  const playerDupes = allDrafts.length - new Set(allDrafts.map((d) => d.player_id)).size;
  const pickDupes =
    allDrafts.length -
    new Set(allDrafts.map((d) => `${d.draft_year}-${d.pick_overall}`)).size;

  const allSeasons = await fetchAll<{ player_id: number; season_year: number }>(
    supabase,
    "fantasy_season_stats",
    "player_id, season_year",
  );
  const seasonDupes =
    allSeasons.length -
    new Set(allSeasons.map((s) => `${s.player_id}-${s.season_year}`)).size;

  console.log(`duplicate player_id in draft_picks:        ${playerDupes}`);
  console.log(`duplicate (draft_year, pick_overall):     ${pickDupes}`);
  console.log(`duplicate (player_id, season_year):       ${seasonDupes}`);

  section("Fantasy points sanity");
  const badHalfPpr = await fetchAll<{
    fantasy_points_standard: number;
    fantasy_points_ppr: number;
    fantasy_points_half_ppr: number;
    receptions: number;
  }>(
    supabase,
    "fantasy_season_stats",
    "fantasy_points_standard, fantasy_points_ppr, fantasy_points_half_ppr, receptions",
  );

  let halfPprMismatch = 0;
  let pprBelowStandard = 0;
  let negativePoints = 0;

  for (const row of badHalfPpr) {
    const expectedHalf =
      Math.round((row.fantasy_points_standard + row.receptions * 0.5) * 100) / 100;
    if (Math.abs(row.fantasy_points_half_ppr - expectedHalf) > 0.02) {
      halfPprMismatch++;
    }
    if (row.fantasy_points_ppr < row.fantasy_points_standard - 0.01) {
      pprBelowStandard++;
    }
    if (
      row.fantasy_points_standard < 0 ||
      row.fantasy_points_ppr < 0 ||
      row.fantasy_points_half_ppr < 0
    ) {
      negativePoints++;
    }
  }

  console.log(`half_ppr formula mismatches (>0.02):  ${halfPprMismatch}`);
  console.log(`ppr < standard (unexpected):          ${pprBelowStandard}`);
  console.log(`negative fantasy point rows:          ${negativePoints}`);

  section("Career stats refresh");
  if (careers === 0) {
    console.log("FAIL: player_career_stats is empty.");
    console.log("Run in Supabase SQL Editor: select refresh_player_career_stats();");
  } else if (careers < players * 0.5) {
    console.log(`WARN: only ${careers}/${players} players have career rows.`);
  } else {
    console.log(`ok: ${careers} career rows for ${players} players.`);
  }

  const playersWithStats = new Set(allSeasons.map((s) => s.player_id)).size;
  const undrafted = await fetchAll<{ id: number; is_undrafted: boolean }>(
    supabase,
    "players",
    "id, is_undrafted",
  );
  const undraftedCount = undrafted.filter((p) => p.is_undrafted).length;
  const undraftedWithStats = undrafted.filter(
    (p) => p.is_undrafted && seasonPlayerIds.has(p.id),
  ).length;

  section("Player linkage");
  console.log(`players with >=1 season row:  ${playersWithStats}`);
  console.log(`players without season rows:  ${players - playersWithStats}`);
  console.log(`flagged undrafted:            ${undraftedCount}`);
  console.log(`undrafted with stats:         ${undraftedWithStats}`);

  section("Summary");
  const issues: string[] = [];
  if (missingYears.length) issues.push(`missing seasons: ${missingYears.join(", ")}`);
  if (orphanDrafts) issues.push(`${orphanDrafts} orphan draft picks`);
  if (playerDupes || pickDupes || seasonDupes) issues.push("duplicate key violations");
  if (halfPprMismatch) issues.push(`${halfPprMismatch} half-PPR mismatches`);
  if (careers === 0) issues.push("career stats not refreshed");
  if (draftsWithoutStats > 50) {
    issues.push(`${draftsWithoutStats} drafted players lack stats (may be pre-2000 careers)`);
  }

  if (issues.length === 0) {
    console.log("No major integrity issues detected.");
  } else {
    console.log("Issues to review:");
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
