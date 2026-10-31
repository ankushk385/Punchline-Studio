-- Punchline Studio: contextual performance sessions
--
-- Additive and backward-compatible with StandUp Companion. Existing tables,
-- columns, policies, storage buckets, and data are intentionally untouched.
-- Joke, version, setlist, gig, and recording identifiers remain text because
-- legacy clients generate text IDs and use tombstones rather than FK cascades.

create table if not exists public.standup_performance_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  gig_id text,
  setlist_id text not null,
  recording_id text,
  audience_type text not null default 'any',
  status text not null default 'setup'
    check (status in ('setup', 'live', 'review', 'complete', 'abandoned')),
  record_audio boolean not null default true,
  show_teleprompter boolean not null default false,
  started_at timestamptz not null,
  ended_at timestamptz,
  timezone text not null default 'UTC',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists standup_performance_sessions_user_time_idx
  on public.standup_performance_sessions (user_id, started_at desc);
create index if not exists standup_performance_sessions_user_status_idx
  on public.standup_performance_sessions (user_id, status, updated_at desc);

create table if not exists public.standup_session_joke_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.standup_performance_sessions(id) on delete cascade,
  joke_id text not null,
  joke_version_id text,
  setlist_position integer not null check (setlist_position >= 0),
  timestamp_ms bigint not null check (timestamp_ms >= 0),
  recording_timestamp_ms bigint not null default 0 check (recording_timestamp_ms >= 0),
  event_type text not null default 'marker'
    check (event_type in ('start', 'marker', 'correction', 'end')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists standup_session_events_user_session_time_idx
  on public.standup_session_joke_events (user_id, session_id, timestamp_ms);
create index if not exists standup_session_events_user_joke_version_idx
  on public.standup_session_joke_events (user_id, joke_id, joke_version_id, created_at desc);

create table if not exists public.standup_session_joke_reviews (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.standup_performance_sessions(id) on delete cascade,
  joke_id text not null,
  joke_version_id text,
  event_id uuid references public.standup_session_joke_events(id) on delete set null,
  rating smallint check (rating between 1 and 5),
  laugh_score smallint check (laugh_score between 0 and 100),
  audience_type text,
  decision text not null default 'undecided'
    check (decision in ('keep', 'rework', 'undecided')),
  note text,
  reaction_note text,
  segment_start_ms bigint check (segment_start_ms >= 0),
  gig_id text,
  setlist_id text,
  revision_joke_version_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id, joke_id, event_id)
);

create index if not exists standup_session_reviews_user_session_idx
  on public.standup_session_joke_reviews (user_id, session_id, updated_at desc);
create index if not exists standup_session_reviews_user_joke_version_idx
  on public.standup_session_joke_reviews (user_id, joke_id, joke_version_id, created_at desc);

alter table public.standup_performance_sessions enable row level security;
alter table public.standup_session_joke_events enable row level security;
alter table public.standup_session_joke_reviews enable row level security;

create policy "punchline sessions select own" on public.standup_performance_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "punchline sessions insert own" on public.standup_performance_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "punchline sessions update own" on public.standup_performance_sessions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "punchline sessions delete own" on public.standup_performance_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "punchline session events select own" on public.standup_session_joke_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "punchline session events insert own" on public.standup_session_joke_events
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.standup_performance_sessions session
      where session.id = session_id and session.user_id = (select auth.uid())
    )
  );
create policy "punchline session events update own" on public.standup_session_joke_events
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "punchline session events delete own" on public.standup_session_joke_events
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "punchline session reviews select own" on public.standup_session_joke_reviews
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "punchline session reviews insert own" on public.standup_session_joke_reviews
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.standup_performance_sessions session
      where session.id = session_id and session.user_id = (select auth.uid())
    )
  );
create policy "punchline session reviews update own" on public.standup_session_joke_reviews
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "punchline session reviews delete own" on public.standup_session_joke_reviews
  for delete to authenticated using ((select auth.uid()) = user_id);
