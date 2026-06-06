-- Player identity metadata for name normalization, undrafted tracking, and disambiguation

alter table public.players
  add column if not exists display_name text,
  add column if not exists name_key text,
  add column if not exists suffix text,
  add column if not exists pfr_player_id text,
  add column if not exists is_undrafted boolean not null default false,
  add column if not exists debut_season integer,
  add column if not exists final_season integer;

create index if not exists players_name_key_idx
  on public.players (name_key);

create index if not exists players_is_undrafted_idx
  on public.players (is_undrafted);

create index if not exists players_debut_season_idx
  on public.players (debut_season);

-- Must drop first: CREATE OR REPLACE cannot reorder/rename view columns
drop view if exists public.player_profiles;

create view public.player_profiles as
select
  p.id as player_id,
  p.external_id,
  p.full_name,
  p.display_name,
  p.name_key,
  p.suffix,
  p.primary_position,
  p.is_undrafted,
  p.debut_season,
  p.final_season,
  p.pfr_player_id,
  pcs.draft_year,
  pcs.draft_round,
  pcs.draft_pick_overall,
  pcs.draft_position,
  pcs.drafting_team,
  pcs.college,
  pcs.first_season,
  pcs.last_season,
  pcs.seasons_played,
  pcs.games_played,
  pcs.games_started,
  pcs.pass_attempts,
  pcs.pass_completions,
  pcs.pass_yards,
  pcs.pass_touchdowns,
  pcs.interceptions,
  pcs.rush_attempts,
  pcs.rush_yards,
  pcs.rush_touchdowns,
  pcs.targets,
  pcs.receptions,
  pcs.receiving_yards,
  pcs.receiving_touchdowns,
  pcs.fumbles_lost,
  pcs.fantasy_points_standard,
  pcs.fantasy_points_ppr,
  pcs.fantasy_points_half_ppr,
  pcs.fantasy_points_ppr_per_game,
  pcs.refreshed_at
from public.players p
left join public.player_career_stats pcs on pcs.player_id = p.id;

grant select on public.player_profiles to anon, authenticated;
