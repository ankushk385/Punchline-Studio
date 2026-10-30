-- Additive recovery-goal, daily check-in, milestone, and audio metadata upgrade.
-- Existing goals, diary entries, support sessions, recordings, and chat rows are retained.

alter table public.goals add column if not exists metric text not null default 'abstinence' check (metric in ('abstinence','moderation'));

alter table public.goals add column if not exists success_definition text not null default 'A day I followed my plan' check (char_length(success_definition) between 1 and 500);

alter table public.goals add column if not exists why text not null default '' check (char_length(why) <= 1000);

alter table public.goals add column if not exists top_trigger text check (top_trigger is null or top_trigger in ('scrolling','boredom','stress','loneliness','late-night','autopilot'));

alter table public.goals add column if not exists archived_at timestamptz;

create unique index if not exists goals_id_owner_unique_idx on public.goals(id, user_id);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  local_date date not null,
  timezone text not null check (char_length(timezone) between 1 and 100),
  status text not null check (status in ('met_goal','setback')),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, goal_id, local_date),
  foreign key (goal_id, user_id) references public.goals(id, user_id) on delete cascade
);

create index if not exists daily_checkins_goal_day_idx on public.daily_checkins(user_id, goal_id, local_date desc);

create table if not exists public.goal_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  milestone_days integer not null check (milestone_days in (1,3,7,14,30,90)),
  earned_at timestamptz not null default now(),
  unique (user_id, goal_id, milestone_days),
  foreign key (goal_id, user_id) references public.goals(id, user_id) on delete cascade
);

create index if not exists goal_awards_owner_goal_idx on public.goal_awards(user_id, goal_id, milestone_days);

alter table public.support_sessions add column if not exists goal_id uuid;

alter table public.support_sessions drop constraint if exists support_sessions_goal_id_fkey;

alter table public.support_sessions add constraint support_sessions_goal_owner_fkey foreign key (goal_id, user_id) references public.goals(id, user_id) on delete set null;

alter table public.audio_assets add column if not exists goal_id uuid;

alter table public.audio_assets add column if not exists mood text check (mood is null or mood in ('great','good','okay','tough','low'));

alter table public.audio_assets add column if not exists trigger_key text check (trigger_key is null or trigger_key in ('scrolling','boredom','stress','loneliness','late-night','autopilot'));

alter table public.audio_assets add column if not exists purpose text not null default 'difficult-moment' check (purpose in ('motivation','difficult-moment'));

alter table public.audio_assets add column if not exists favorite boolean not null default false;

alter table public.audio_assets add column if not exists review_later boolean not null default false;

alter table public.audio_assets drop constraint if exists audio_assets_goal_id_fkey;

alter table public.audio_assets add constraint audio_assets_goal_owner_fkey foreign key (goal_id, user_id) references public.goals(id, user_id) on delete set null;

alter table public.daily_checkins enable row level security;

alter table public.goal_awards enable row level security;

revoke all on public.daily_checkins, public.goal_awards from anon, authenticated;

grant select, insert, update, delete on public.daily_checkins to authenticated;

grant select on public.goal_awards to authenticated;

create policy daily_checkins_select_own on public.daily_checkins for select to authenticated using ((select auth.uid()) = user_id);

create policy daily_checkins_insert_own on public.daily_checkins for insert to authenticated with check ((select auth.uid()) = user_id);

create policy daily_checkins_update_own on public.daily_checkins for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy daily_checkins_delete_own on public.daily_checkins for delete to authenticated using ((select auth.uid()) = user_id);

create policy goal_awards_select_own on public.goal_awards for select to authenticated using ((select auth.uid()) = user_id);

create trigger daily_checkins_set_updated_at before update on public.daily_checkins for each row execute function public.set_updated_at();

create or replace function public.save_active_goal(payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
declare goal_id uuid := coalesce((payload ->> 'id')::uuid, gen_random_uuid());
begin
  if owner_id is null then raise exception 'authentication required'; end if;
  update public.goals set active = false, archived_at = coalesce(archived_at, now()) where user_id = owner_id and active and id <> goal_id;
  insert into public.goals(id,user_id,title,description,category,metric,success_definition,why,top_trigger,active,archived_at)
  values (goal_id,owner_id,payload->>'title',coalesce(payload->>'description',''),payload->>'category',payload->>'metric',payload->>'success_definition',coalesce(payload->>'why',''),nullif(payload->>'top_trigger',''),true,null)
  on conflict (id) do update set title=excluded.title, description=excluded.description, category=excluded.category, metric=excluded.metric, success_definition=excluded.success_definition, why=excluded.why, top_trigger=excluded.top_trigger, active=true, archived_at=null
  where public.goals.user_id = owner_id;
  return goal_id;
end;
$$;

revoke all on function public.save_active_goal(jsonb) from public, anon;

grant execute on function public.save_active_goal(jsonb) to authenticated;

create or replace function public.reconcile_goal_awards(target_user uuid, target_goal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare best_run integer := 0;
declare milestone integer;
begin
  if target_user <> (select auth.uid()) then raise exception 'not allowed'; end if;
  select coalesce(max(run_length),0) into best_run from (
    select count(*)::integer as run_length from (
      select local_date, local_date - (row_number() over (order by local_date))::integer as island
      from public.daily_checkins where user_id=target_user and goal_id=target_goal and status='met_goal'
    ) successes group by island
  ) streaks;
  foreach milestone in array array[1,3,7,14,30,90] loop
    if best_run >= milestone then
      insert into public.goal_awards(user_id,goal_id,milestone_days) values(target_user,target_goal,milestone)
      on conflict (user_id,goal_id,milestone_days) do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.reconcile_goal_awards(uuid,uuid) from public, anon;

grant execute on function public.reconcile_goal_awards(uuid,uuid) to authenticated;

create or replace function public.daily_checkin_awards_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.reconcile_goal_awards(new.user_id,new.goal_id);
  return new;
end;
$$;

create trigger daily_checkin_awards after insert or update on public.daily_checkins for each row execute function public.daily_checkin_awards_trigger();

comment on table public.daily_checkins is 'One explicit local-calendar result per user, goal, and date. Absence means unrecorded, never setback.';

comment on table public.goal_awards is 'Monotonic milestone grants. Corrections can change calculated streaks but never delete an earned award.';
