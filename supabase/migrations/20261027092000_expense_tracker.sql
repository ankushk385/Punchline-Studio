create table if not exists public.expense_transactions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount >= 0),
  category text not null,
  note text not null default '',
  date date not null,
  created_at timestamptz not null,
  primary key (user_id, id)
);

create table if not exists public.expense_budgets (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_key text not null,
  monthly_limit numeric(14, 2) not null check (monthly_limit >= 0),
  alert_pct integer not null default 80 check (alert_pct between 1 and 100),
  primary key (user_id, id),
  unique (user_id, category_key)
);

create index if not exists expense_transactions_user_date_idx
  on public.expense_transactions (user_id, date desc, created_at desc);

create index if not exists expense_budgets_user_category_idx
  on public.expense_budgets (user_id, category_key);

alter table public.expense_transactions enable row level security;

alter table public.expense_budgets enable row level security;

create policy "expense transactions owner all"
  on public.expense_transactions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "expense budgets owner all"
  on public.expense_budgets for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
