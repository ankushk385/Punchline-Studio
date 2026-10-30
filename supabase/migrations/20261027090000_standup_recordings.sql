create table if not exists public.standup_recordings (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  duration_ms bigint not null check (duration_ms >= 0),
  mime_type text not null default 'audio/mp4',
  joke_id text,
  setlist_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, storage_path)
);

create index if not exists standup_recordings_user_created_idx
  on public.standup_recordings (user_id, created_at desc);

alter table public.standup_recordings enable row level security;

create policy "standup recordings select own"
  on public.standup_recordings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "standup recordings insert own"
  on public.standup_recordings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "standup recordings update own"
  on public.standup_recordings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "standup recordings delete own"
  on public.standup_recordings for delete
  to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'standup-recordings',
  'standup-recordings',
  false,
  104857600,
  array['audio/mp4', 'audio/m4a', 'audio/aac', 'audio/x-m4a', 'audio/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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

