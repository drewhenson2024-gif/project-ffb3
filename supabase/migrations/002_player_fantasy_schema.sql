-- Normalized player, draft, and fantasy stats schema (2000+)
-- Raw tables: players, draft_picks, fantasy_season_stats
-- Transformed table: player_career_stats (refreshed via refresh_player_career_stats())

-- ---------------------------------------------------------------------------
-- Core player identity (links draft data to fantasy stats)
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id bigint generated always as identity primary key,
  external_id text unique,
  full_name text not null,
  primary_position text not null
    check (primary_position in ('QB', 'RB', 'WR', 'TE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists players_primary_position_idx
  on public.players (primary_position);

create index if not exists players_full_name_idx
  on public.players (full_name);

-- ---------------------------------------------------------------------------
-- Raw draft data — every draft class since 2000
-- ---------------------------------------------------------------------------
create table if not exists public.draft_picks (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players (id) on delete cascade,
  draft_year integer not null check (draft_year >= 2000),
  round integer not null check (round >= 1),
  pick_overall integer not null check (pick_overall >= 1),
  drafting_team text not null,
  position text not null check (position in ('QB', 'RB', 'WR', 'TE')),
  college text,
  created_at timestamptz not null default now(),
  unique (draft_year, pick_overall),
  unique (player_id)
);

create index if not exists draft_picks_draft_year_idx
  on public.draft_picks (draft_year);

create index if not exists draft_picks_draft_year_pick_idx
  on public.draft_picks (draft_year, pick_overall);

create index if not exists draft_picks_position_idx
  on public.draft_picks (position);

-- ---------------------------------------------------------------------------
-- Raw fantasy statistics — one row per player per season (2000+)
-- ---------------------------------------------------------------------------
create table if not exists public.fantasy_season_stats (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players (id) on delete cascade,
  season_year integer not null check (season_year >= 2000),
  position text not null check (position in ('QB', 'RB', 'WR', 'TE')),
  team text,

  games_played integer not null default 0 check (games_played >= 0),
  games_started integer not null default 0 check (games_started >= 0),

  pass_attempts integer not null default 0 check (pass_attempts >= 0),
  pass_completions integer not null default 0 check (pass_completions >= 0),
  pass_yards integer not null default 0 check (pass_yards >= 0),
  pass_touchdowns integer not null default 0 check (pass_touchdowns >= 0),
  interceptions integer not null default 0 check (interceptions >= 0),

  rush_attempts integer not null default 0 check (rush_attempts >= 0),
  rush_yards integer not null default 0 check (rush_yards >= 0),
  rush_touchdowns integer not null default 0 check (rush_touchdowns >= 0),

  targets integer not null default 0 check (targets >= 0),
  receptions integer not null default 0 check (receptions >= 0),
  receiving_yards integer not null default 0 check (receiving_yards >= 0),
  receiving_touchdowns integer not null default 0 check (receiving_touchdowns >= 0),

  fumbles_lost integer not null default 0 check (fumbles_lost >= 0),

  fantasy_points_standard numeric(8, 2) not null default 0,
  fantasy_points_ppr numeric(8, 2) not null default 0,
  fantasy_points_half_ppr numeric(8, 2) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (player_id, season_year)
);

create index if not exists fantasy_season_stats_player_id_idx
  on public.fantasy_season_stats (player_id);

create index if not exists fantasy_season_stats_season_year_idx
  on public.fantasy_season_stats (season_year);

create index if not exists fantasy_season_stats_position_idx
  on public.fantasy_season_stats (position);

create index if not exists fantasy_season_stats_season_position_idx
  on public.fantasy_season_stats (season_year, position);

-- ---------------------------------------------------------------------------
-- Transformed career totals (derived from fantasy_season_stats + draft_picks)
-- ---------------------------------------------------------------------------
create table if not exists public.player_career_stats (
  player_id bigint primary key references public.players (id) on delete cascade,

  draft_year integer,
  draft_round integer,
  draft_pick_overall integer,
  draft_position text,
  drafting_team text,
  college text,

  first_season integer,
  last_season integer,
  seasons_played integer not null default 0 check (seasons_played >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  games_started integer not null default 0 check (games_started >= 0),

  pass_attempts integer not null default 0,
  pass_completions integer not null default 0,
  pass_yards integer not null default 0,
  pass_touchdowns integer not null default 0,
  interceptions integer not null default 0,
  rush_attempts integer not null default 0,
  rush_yards integer not null default 0,
  rush_touchdowns integer not null default 0,
  targets integer not null default 0,
  receptions integer not null default 0,
  receiving_yards integer not null default 0,
  receiving_touchdowns integer not null default 0,
  fumbles_lost integer not null default 0,

  fantasy_points_standard numeric(10, 2) not null default 0,
  fantasy_points_ppr numeric(10, 2) not null default 0,
  fantasy_points_half_ppr numeric(10, 2) not null default 0,
  fantasy_points_ppr_per_game numeric(8, 2),

  refreshed_at timestamptz not null default now()
);

create index if not exists player_career_stats_draft_year_idx
  on public.player_career_stats (draft_year);

create index if not exists player_career_stats_draft_pick_idx
  on public.player_career_stats (draft_year, draft_pick_overall);

create index if not exists player_career_stats_fantasy_ppr_idx
  on public.player_career_stats (fantasy_points_ppr desc);

create index if not exists player_career_stats_position_idx
  on public.player_career_stats (draft_position);

-- ---------------------------------------------------------------------------
-- Rebuild career totals after raw data imports
-- ---------------------------------------------------------------------------
create or replace function public.refresh_player_career_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.player_career_stats;

  insert into public.player_career_stats (
    player_id,
    draft_year,
    draft_round,
    draft_pick_overall,
    draft_position,
    drafting_team,
    college,
    first_season,
    last_season,
    seasons_played,
    games_played,
    games_started,
    pass_attempts,
    pass_completions,
    pass_yards,
    pass_touchdowns,
    interceptions,
    rush_attempts,
    rush_yards,
    rush_touchdowns,
    targets,
    receptions,
    receiving_yards,
    receiving_touchdowns,
    fumbles_lost,
    fantasy_points_standard,
    fantasy_points_ppr,
    fantasy_points_half_ppr,
    fantasy_points_ppr_per_game,
    refreshed_at
  )
  select
    p.id,
    dp.draft_year,
    dp.round,
    dp.pick_overall,
    dp.position,
    dp.drafting_team,
    dp.college,
    min(fss.season_year),
    max(fss.season_year),
    count(distinct fss.season_year)::integer,
    coalesce(sum(fss.games_played), 0)::integer,
    coalesce(sum(fss.games_started), 0)::integer,
    coalesce(sum(fss.pass_attempts), 0)::integer,
    coalesce(sum(fss.pass_completions), 0)::integer,
    coalesce(sum(fss.pass_yards), 0)::integer,
    coalesce(sum(fss.pass_touchdowns), 0)::integer,
    coalesce(sum(fss.interceptions), 0)::integer,
    coalesce(sum(fss.rush_attempts), 0)::integer,
    coalesce(sum(fss.rush_yards), 0)::integer,
    coalesce(sum(fss.rush_touchdowns), 0)::integer,
    coalesce(sum(fss.targets), 0)::integer,
    coalesce(sum(fss.receptions), 0)::integer,
    coalesce(sum(fss.receiving_yards), 0)::integer,
    coalesce(sum(fss.receiving_touchdowns), 0)::integer,
    coalesce(sum(fss.fumbles_lost), 0)::integer,
    coalesce(sum(fss.fantasy_points_standard), 0),
    coalesce(sum(fss.fantasy_points_ppr), 0),
    coalesce(sum(fss.fantasy_points_half_ppr), 0),
    case
      when coalesce(sum(fss.games_played), 0) > 0
        then round(sum(fss.fantasy_points_ppr) / sum(fss.games_played), 2)
      else null
    end,
    now()
  from public.players p
  left join public.draft_picks dp on dp.player_id = p.id
  left join public.fantasy_season_stats fss on fss.player_id = p.id
  group by
    p.id,
    dp.draft_year,
    dp.round,
    dp.pick_overall,
    dp.position,
    dp.drafting_team,
    dp.college;
end;
$$;

-- ---------------------------------------------------------------------------
-- Website-friendly view: player + draft context + career totals
-- ---------------------------------------------------------------------------
create or replace view public.player_profiles as
select
  p.id as player_id,
  p.external_id,
  p.full_name,
  p.primary_position,
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

-- ---------------------------------------------------------------------------
-- Row level security (public read for website)
-- ---------------------------------------------------------------------------
alter table public.players enable row level security;
alter table public.draft_picks enable row level security;
alter table public.fantasy_season_stats enable row level security;
alter table public.player_career_stats enable row level security;

drop policy if exists "public can read players" on public.players;
create policy "public can read players"
  on public.players for select to anon, authenticated using (true);

drop policy if exists "public can read draft_picks" on public.draft_picks;
create policy "public can read draft_picks"
  on public.draft_picks for select to anon, authenticated using (true);

drop policy if exists "public can read fantasy_season_stats" on public.fantasy_season_stats;
create policy "public can read fantasy_season_stats"
  on public.fantasy_season_stats for select to anon, authenticated using (true);

drop policy if exists "public can read player_career_stats" on public.player_career_stats;
create policy "public can read player_career_stats"
  on public.player_career_stats for select to anon, authenticated using (true);

grant select on public.players to anon, authenticated;
grant select on public.draft_picks to anon, authenticated;
grant select on public.fantasy_season_stats to anon, authenticated;
grant select on public.player_career_stats to anon, authenticated;
grant select on public.player_profiles to anon, authenticated;
