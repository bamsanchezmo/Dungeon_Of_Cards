create table if not exists public.leaderboard (
  run_key text primary key,
  name text not null,
  score integer not null default 0,
  result text not null,
  mode text not null,
  floor integer not null default 1,
  total_floors integer not null default 1,
  gold integer not null default 0,
  debt integer not null default 0,
  profit integer not null default 0,
  rounds integer not null default 0,
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_score_idx
  on public.leaderboard (score desc, played_at desc);

alter table public.leaderboard enable row level security;

drop policy if exists "leaderboard_select_public" on public.leaderboard;
create policy "leaderboard_select_public"
  on public.leaderboard
  for select
  to anon
  using (true);

drop policy if exists "leaderboard_insert_public" on public.leaderboard;
create policy "leaderboard_insert_public"
  on public.leaderboard
  for insert
  to anon
  with check (
    length(name) between 1 and 20
    and score >= 0
    and floor >= 1
    and total_floors >= floor
    and result in ('Win', 'Loss')
  );

drop policy if exists "leaderboard_update_public" on public.leaderboard;
create policy "leaderboard_update_public"
  on public.leaderboard
  for update
  to anon
  using (true)
  with check (
    length(name) between 1 and 20
    and score >= 0
    and floor >= 1
    and total_floors >= floor
    and result in ('Win', 'Loss')
  );
