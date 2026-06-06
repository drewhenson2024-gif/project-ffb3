export type Position = "QB" | "RB" | "WR" | "TE";

/** Master player record — links draft data to fantasy stats */
export type Player = {
  id: number;
  external_id: string | null;
  full_name: string;
  display_name: string | null;
  name_key: string | null;
  suffix: string | null;
  primary_position: Position;
  pfr_player_id: string | null;
  is_undrafted: boolean;
  debut_season: number | null;
  final_season: number | null;
  created_at: string;
  updated_at: string;
};

/** Raw draft data for a player (1980+, nflverse coverage) */
export type DraftPick = {
  id: number;
  player_id: number;
  draft_year: number;
  round: number;
  pick_overall: number;
  drafting_team: string;
  position: Position;
  college: string | null;
  created_at: string;
};

/** Raw per-season fantasy stats (2000+) */
export type FantasySeasonStats = {
  id: number;
  player_id: number;
  season_year: number;
  position: Position;
  team: string | null;
  games_played: number;
  games_started: number;
  pass_attempts: number;
  pass_completions: number;
  pass_yards: number;
  pass_touchdowns: number;
  interceptions: number;
  rush_attempts: number;
  rush_yards: number;
  rush_touchdowns: number;
  targets: number;
  receptions: number;
  receiving_yards: number;
  receiving_touchdowns: number;
  fumbles_lost: number;
  fantasy_points_standard: number;
  fantasy_points_ppr: number;
  fantasy_points_half_ppr: number;
  created_at: string;
  updated_at: string;
};

/** Transformed career totals (refreshed after raw data imports) */
export type PlayerCareerStats = {
  player_id: number;
  draft_year: number | null;
  draft_round: number | null;
  draft_pick_overall: number | null;
  draft_position: Position | null;
  drafting_team: string | null;
  college: string | null;
  first_season: number | null;
  last_season: number | null;
  seasons_played: number;
  games_played: number;
  games_started: number;
  pass_attempts: number;
  pass_completions: number;
  pass_yards: number;
  pass_touchdowns: number;
  interceptions: number;
  rush_attempts: number;
  rush_yards: number;
  rush_touchdowns: number;
  targets: number;
  receptions: number;
  receiving_yards: number;
  receiving_touchdowns: number;
  fumbles_lost: number;
  fantasy_points_standard: number;
  fantasy_points_ppr: number;
  fantasy_points_half_ppr: number;
  fantasy_points_ppr_per_game: number | null;
  refreshed_at: string;
};

/** Website view: player identity + draft context + career totals */
export type PlayerProfile = {
  player_id: number;
  external_id: string | null;
  full_name: string;
  display_name: string | null;
  name_key: string | null;
  suffix: string | null;
  primary_position: Position;
  is_undrafted: boolean | null;
  debut_season: number | null;
  final_season: number | null;
  pfr_player_id: string | null;
  draft_year: number | null;
  draft_round: number | null;
  draft_pick_overall: number | null;
  draft_position: Position | null;
  drafting_team: string | null;
  college: string | null;
  first_season: number | null;
  last_season: number | null;
  seasons_played: number | null;
  games_played: number | null;
  games_started: number | null;
  pass_attempts: number | null;
  pass_completions: number | null;
  pass_yards: number | null;
  pass_touchdowns: number | null;
  interceptions: number | null;
  rush_attempts: number | null;
  rush_yards: number | null;
  rush_touchdowns: number | null;
  targets: number | null;
  receptions: number | null;
  receiving_yards: number | null;
  receiving_touchdowns: number | null;
  fumbles_lost: number | null;
  fantasy_points_standard: number | null;
  fantasy_points_ppr: number | null;
  fantasy_points_half_ppr: number | null;
  fantasy_points_ppr_per_game: number | null;
  refreshed_at: string | null;
};
