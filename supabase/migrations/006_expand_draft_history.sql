-- Link pre-2000 draft picks to players with 2000+ fantasy stats
-- nflverse draft data starts in 1980

alter table public.draft_picks
  drop constraint if exists draft_picks_draft_year_check;

alter table public.draft_picks
  add constraint draft_picks_draft_year_check
  check (draft_year >= 1980);
