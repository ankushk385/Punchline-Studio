-- StandUp Companion: cross-device cloud synchronization
--
-- Every account-owned record keeps a stable client-generated id plus the
-- client's modification timestamp. Complex application payloads (joke version
-- arrays, ordered setlist entries, etc.) live in JSONB so the mobile model can
-- evolve without losing data. Tombstones remain as rows with deleted_at set so
-- an offline device cannot resurrect a record that was deleted elsewhere.

-- ─── Ideas ───────────────────────────────────────────────────────────────────
create table if not exists public.standup_ideas (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists standup_ideas_user_updated_idx
  on public.standup_ideas (user_id, updated_at desc);

-- ─── Jokes ───────────────────────────────────────────────────────────────────
create table if not exists public.standup_jokes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists standup_jokes_user_updated_idx
  on public.standup_jokes (user_id, updated_at desc);

-- ─── Setlists ────────────────────────────────────────────────────────────────
create table if not exists public.standup_setlists (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists standup_setlists_user_updated_idx
  on public.standup_setlists (user_id, updated_at desc);

-- ─── Gigs ────────────────────────────────────────────────────────────────────
-- Device calendar identifiers are deliberately not stored in payload; they are
-- device-local and are preserved locally during a merge.
create table if not exists public.standup_gigs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists standup_gigs_user_updated_idx
  on public.standup_gigs (user_id, updated_at desc);

-- ─── Joke ratings ────────────────────────────────────────────────────────────
create table if not exists public.standup_ratings (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists standup_ratings_user_updated_idx
  on public.standup_ratings (user_id, updated_at desc);

-- ─── Daily progress ──────────────────────────────────────────────────────────
-- One row per user and local calendar date. local_date is ISO YYYY-MM-DD in the
-- user's local timezone; it is intentionally text so the server never shifts it.
create table if not exists public.standup_daily_progress (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, local_date)
);
create index if not exists standup_daily_progress_user_date_idx
  on public.standup_daily_progress (user_id, local_date);

-- ─── User settings ───────────────────────────────────────────────────────────
-- Exactly one settings row per account.
create table if not exists public.standup_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Recording metadata extension ────────────────────────────────────────────
alter table public.standup_recordings
  add column if not exists idea_id text,
  add column if not exists kind text not null default 'performance',
  add column if not exists is_best_take boolean not null default false,
  add column if not exists notes text not null default '',
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists deleted_at timestamptz;

create index if not exists standup_recordings_user_updated_idx
  on public.standup_recordings (user_id, updated_at desc);

-- Recordings are hard-deleted (storage object + metadata row) so a separate
-- tombstone table carries the deletion across devices without keeping metadata.
create table if not exists public.standup_recording_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  recording_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, recording_id)
);
create index if not exists standup_recording_tombstones_user_idx
  on public.standup_recording_tombstones (user_id, deleted_at desc);

-- ─── Row level security ──────────────────────────────────────────────────────
-- Replace the original recording policies (space-separated names) so the
-- recording table ends up with exactly one owner-scoped policy per action.
drop policy if exists "standup recordings select own" on public.standup_recordings;
drop policy if exists "standup recordings insert own" on public.standup_recordings;
drop policy if exists "standup recordings update own" on public.standup_recordings;
drop policy if exists "standup recordings delete own" on public.standup_recordings;

alter table public.standup_ideas enable row level security;
alter table public.standup_jokes enable row level security;
alter table public.standup_setlists enable row level security;
alter table public.standup_gigs enable row level security;
alter table public.standup_ratings enable row level security;
alter table public.standup_daily_progress enable row level security;
alter table public.standup_user_settings enable row level security;
alter table public.standup_recordings enable row level security;
alter table public.standup_recording_tombstones enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'standup_ideas', 'standup_jokes', 'standup_setlists', 'standup_gigs',
    'standup_ratings', 'standup_daily_progress', 'standup_recordings',
    'standup_recording_tombstones'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || ' select own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' insert own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' update own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' delete own', table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      table_name || ' select own', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      table_name || ' insert own', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name || ' update own', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      table_name || ' delete own', table_name
    );
  end loop;
end $$;

-- user_settings is keyed by user_id rather than an id column.
drop policy if exists "standup_user_settings select own" on public.standup_user_settings;
drop policy if exists "standup_user_settings insert own" on public.standup_user_settings;
drop policy if exists "standup_user_settings update own" on public.standup_user_settings;
drop policy if exists "standup_user_settings delete own" on public.standup_user_settings;

create policy "standup_user_settings select own"
  on public.standup_user_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "standup_user_settings insert own"
  on public.standup_user_settings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "standup_user_settings update own"
  on public.standup_user_settings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "standup_user_settings delete own"
  on public.standup_user_settings for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ─── Private audio storage ──────────────────────────────────────────────────
-- Keep the bucket private and reassert owner-scoped object policies. Object
-- paths must stay <authenticated-user-id>/<recording-id>.<extension>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'standup-recordings',
  'standup-recordings',
  false,
  104857600,
  array['audio/mp4', 'audio/m4a', 'audio/aac', 'audio/x-m4a', 'audio/webm']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "standup audio select own" on storage.objects;
drop policy if exists "standup audio insert own" on storage.objects;
drop policy if exists "standup audio update own" on storage.objects;
drop policy if exists "standup audio delete own" on storage.objects;

create policy "standup audio select own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'standup-recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "standup audio insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'standup-recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "standup audio update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'standup-recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'standup-recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "standup audio delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'standup-recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
