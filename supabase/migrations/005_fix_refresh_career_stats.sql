-- Supabase requires WHERE on DELETE; fix career stats refresh function
create or replace function public.refresh_player_career_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.player_career_stats where player_id >= 0;

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
