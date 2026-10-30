create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  timezone text not null default 'UTC',
  onboarding_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  goal_type text not null default 'reduce' check (goal_type in ('reduce','abstain','broader-habit')),
  ai_enabled boolean not null default false,
  allow_diary_context boolean not null default false,
  ai_memory_enabled boolean not null default false,
  private_sync_enabled boolean not null default true,
  notification_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default 'habit-change',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goals_owner_active_idx on public.goals(user_id, active);

create table public.personal_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  category text not null default 'why',
  is_active boolean not null default true,
  allow_ai boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reminders_owner_active_idx on public.personal_reminders(user_id, is_active);

create table public.personal_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_key text check (trigger_key is null or trigger_key in ('scrolling','boredom','stress','loneliness','late-night','autopilot')),
  if_text text not null check (char_length(if_text) between 1 and 500),
  then_text text not null check (char_length(then_text) between 1 and 500),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rules_owner_trigger_idx on public.personal_rules(user_id, trigger_key);

create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_key text not null check (trigger_key in ('scrolling','boredom','stress','loneliness','late-night','autopilot')),
  urge_before smallint check (urge_before between 1 and 5),
  urge_after smallint check (urge_after between 1 and 5),
  outcome text not null default 'completed',
  completed_action_ids text[] not null default '{}',
  alternative_action_ids text[] not null default '{}',
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index support_owner_created_idx on public.support_sessions(user_id, created_at desc);

create table public.support_action_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  action_id text not null,
  response text not null default '' check (char_length(response) <= 1000),
  used_alternative boolean not null default false,
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.support_sessions(id, user_id) on delete cascade
);

create index support_response_owner_session_idx on public.support_action_responses(user_id, session_id);

create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  mood text not null check (mood in ('great','good','okay','tough','low')),
  trigger_key text check (trigger_key is null or trigger_key in ('scrolling','boredom','stress','loneliness','late-night','autopilot')),
  outcome text not null check (outcome in ('managed','reduced','setback','no-urge')),
  helped_strategy text not null default '' check (char_length(helped_strategy) <= 500),
  body text not null default '' check (char_length(body) <= 10000),
  tags text[] not null default '{}',
  support_session_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (support_session_id, user_id) references public.support_sessions(id, user_id) on delete set null
);

create index diary_owner_day_idx on public.diary_entries(user_id, entry_date desc, created_at desc);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  type text not null check (type in ('article','story','quote')),
  title text not null,
  teaser text not null default '',
  body text not null,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes between 1 and 120),
  tags text[] not null default '{}',
  source_url text,
  source_name text,
  evidence_level text not null,
  reviewed_at date,
  published_at timestamptz,
  published boolean not null default false,
  language text not null default 'en',
  content_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_published_type_idx on public.content_items(published, type, published_at desc);

create table public.content_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  completed_at timestamptz,
  bookmarked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, content_id)
);

create table public.user_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  tag text not null default 'reflection',
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav')),
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  description text not null default '' check (char_length(description) <= 2000),
  tag text not null default 'my own reminder',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index audio_owner_created_idx on public.audio_assets(user_id, created_at desc);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Reflection' check (char_length(title) <= 200),
  summary text not null default '' check (char_length(summary) <= 4000),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index ai_conversation_owner_recent_idx on public.ai_conversations(user_id, last_message_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  provider text,
  token_count integer check (token_count is null or token_count >= 0),
  client_request_id uuid,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.ai_conversations(id, user_id) on delete cascade,
  unique (user_id, client_request_id)
);

create index ai_message_owner_thread_idx on public.ai_messages(user_id, conversation_id, created_at);

create table public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  statement text not null check (char_length(statement) between 1 and 1000),
  source_message_id uuid references public.ai_messages(id) on delete set null,
  source text not null default 'explicit-user-action',
  approved boolean not null default true,
  editable boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_memory_owner_approved_idx on public.ai_memories(user_id, approved);

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','user_preferences','goals','personal_reminders','personal_rules','support_sessions','diary_entries','content_items','content_progress','user_quotes','audio_assets','ai_conversations','ai_memories']
  loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger security definer set search_path = '' language plpgsql as $$
begin
  insert into public.profiles(user_id, display_name, timezone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''), coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC'));
  insert into public.user_preferences(user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','user_preferences','goals','personal_reminders','personal_rules','support_sessions','support_action_responses','diary_entries','content_progress','user_quotes','audio_assets','ai_conversations','ai_messages','ai_memories']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', table_name || '_delete_own', table_name);
  end loop;
end $$;

alter table public.content_items enable row level security;

revoke all on public.content_items from anon, authenticated;

grant select on public.content_items to authenticated;

create policy content_select_published on public.content_items for select to authenticated using (published = true);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('private-audio', 'private-audio', false, 26214400, array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy audio_storage_select_own on storage.objects for select to authenticated
using (bucket_id = 'private-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy audio_storage_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'private-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy audio_storage_update_own on storage.objects for update to authenticated
using (bucket_id = 'private-audio' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'private-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy audio_storage_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'private-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.save_support_checkin(payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid := coalesce((payload ->> 'id')::uuid, gen_random_uuid());
declare response jsonb;
begin
  insert into public.support_sessions(id, user_id, trigger_key, urge_before, urge_after, outcome, completed_action_ids, alternative_action_ids, note)
  values (new_id, (select auth.uid()), payload ->> 'trigger_key', nullif(payload ->> 'urge_before','')::smallint, nullif(payload ->> 'urge_after','')::smallint, coalesce(payload ->> 'outcome','completed'), coalesce(array(select jsonb_array_elements_text(payload -> 'completed_action_ids')), '{}'), coalesce(array(select jsonb_array_elements_text(payload -> 'alternative_action_ids')), '{}'), coalesce(payload ->> 'note',''));
  for response in select * from jsonb_array_elements(coalesce(payload -> 'responses','[]'::jsonb)) loop
    insert into public.support_action_responses(user_id, session_id, action_id, response, used_alternative, skipped)
    values ((select auth.uid()), new_id, response ->> 'action_id', coalesce(response ->> 'response',''), coalesce((response ->> 'used_alternative')::boolean,false), coalesce((response ->> 'skipped')::boolean,false));
  end loop;
  return new_id;
end;
$$;

revoke all on function public.save_support_checkin(jsonb) from public, anon;

grant execute on function public.save_support_checkin(jsonb) to authenticated;
