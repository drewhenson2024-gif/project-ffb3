import type { createServerClient } from "@/lib/supabase/server";
import type { FantasySeasonStats, Position } from "@/types/database";
import { isCareerComplete, recentSeasonYears } from "./career-complete";
import { getValuationSeasonYears } from "./pab";
import type { CareerMeta } from "./player-profiles";
import type { SeasonStatRow } from "./player-profiles";

export type ValuationSeasonRow = Pick<
  FantasySeasonStats,
  | "season_year"
  | "position"
  | "fantasy_points_ppr"
  | "fantasy_points_half_ppr"
  | "fantasy_points_standard"
>;

const SEASON_SELECT =
  "season_year, position, fantasy_points_ppr, fantasy_points_half_ppr, fantasy_points_standard";

const FULL_SEASON_SELECT =
  "player_id, season_year, position, fantasy_points_ppr, fantasy_points_half_ppr, fantasy_points_standard, games_played";

const PAGE_SIZE = 1000;

export async function getMaxSeasonYear(
  supabase: ReturnType<typeof createServerClient>,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("fantasy_season_stats")
    .select("season_year")
    .order("season_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.season_year ?? null;
}

async function fetchSeasonRows(
  supabase: ReturnType<typeof createServerClient>,
  years: number[],
): Promise<ValuationSeasonRow[]> {
  const rows: ValuationSeasonRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("fantasy_season_stats")
      .select(SEASON_SELECT)
      .in("season_year", years)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    rows.push(...(data as ValuationSeasonRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export async function loadValuationSeasons(
  supabase: ReturnType<typeof createServerClient>,
): Promise<{ years: number[]; seasons: ValuationSeasonRow[] }> {
  const maxYear = await getMaxSeasonYear(supabase);
  if (maxYear === null) {
    return { years: [], seasons: [] };
  }

  const years = getValuationSeasonYears(maxYear);
  const seasons = await fetchSeasonRows(supabase, years);

  return { years, seasons };
}

async function fetchPaginated<T>(
  supabase: ReturnType<typeof createServerClient>,
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

export async function loadAllSeasonStats(
  supabase: ReturnType<typeof createServerClient>,
): Promise<SeasonStatRow[]> {
  return fetchPaginated<SeasonStatRow>(
    supabase,
    "fantasy_season_stats",
    FULL_SEASON_SELECT,
  );
}

export async function loadCareerMeta(
  supabase: ReturnType<typeof createServerClient>,
): Promise<CareerMeta[]> {
  return fetchPaginated<CareerMeta>(
    supabase,
    "player_career_stats",
    "player_id, draft_year, draft_pick_overall, draft_position, first_season, last_season",
  );
}

export type PlayerIdentity = {
  id: number;
  is_undrafted: boolean;
  primary_position: Position;
};

export async function loadPlayerIdentities(
  supabase: ReturnType<typeof createServerClient>,
): Promise<PlayerIdentity[]> {
  return fetchPaginated<PlayerIdentity>(
    supabase,
    "players",
    "id, is_undrafted, primary_position",
  );
}

export async function loadCompleteCareerPlayerIds(
  supabase: ReturnType<typeof createServerClient>,
  careers: CareerMeta[],
): Promise<Set<number>> {
  const recent = new Set(recentSeasonYears());
  const recentPlayers = new Set<number>();

  const seasons = await fetchPaginated<{ player_id: number; season_year: number }>(
    supabase,
    "fantasy_season_stats",
    "player_id, season_year",
  );

  for (const row of seasons) {
    if (recent.has(row.season_year)) recentPlayers.add(row.player_id);
  }

  const complete = new Set<number>();
  for (const career of careers) {
    if (
      isCareerComplete(
        career.last_season,
        recentPlayers.has(career.player_id),
      )
    ) {
      complete.add(career.player_id);
    }
  }

  return complete;
}
