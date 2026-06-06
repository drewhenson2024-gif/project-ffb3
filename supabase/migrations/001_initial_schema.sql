-- DEPRECATED: Prototype standings table. Use 002_player_fantasy_schema.sql instead.
-- Fantasy Football starter schema
create table if not exists public.teams (
  id bigint primary key generated always as identity,
  name text not null unique,
  owner_name text not null,
  wins integer not null default 0,
  losses integer not null default 0,
  points_for numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

grant select on public.teams to anon, authenticated;

alter table public.teams enable row level security;

drop policy if exists "public can read teams" on public.teams;
create policy "public can read teams"
  on public.teams
  for select
  to anon, authenticated
  using (true);

insert into public.teams (name, owner_name, wins, losses, points_for) values
  ('Gridiron Giants', 'Alex', 8, 2, 1124.50),
  ('End Zone Elite', 'Jordan', 7, 3, 1089.25),
  ('Fourth & Faith', 'Sam', 6, 4, 1042.00),
  ('Hail Mary Heroes', 'Casey', 5, 5, 998.75),
  ('Red Zone Raiders', 'Taylor', 4, 6, 945.50)
on conflict (name) do nothing;
