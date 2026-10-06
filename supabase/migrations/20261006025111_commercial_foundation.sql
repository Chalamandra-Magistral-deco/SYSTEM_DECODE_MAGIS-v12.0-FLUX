-- ============================================================
-- MAGIS // COMMERCIAL FOUNDATION
-- AUTH -> USER -> PLAN -> CREDITS
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- PLANS
-- ------------------------------------------------------------

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  credits integer not null default 0
    check (credits >= 0),
  price_cents integer not null default 0
    check (price_cents >= 0),
  currency text not null default 'USD'
    check (char_length(currency) = 3),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PROFILES
-- One commercial profile per Supabase Auth user.
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- USER PLAN
-- ------------------------------------------------------------

create table if not exists public.user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'active'
    check (status in ('active', 'paused', 'cancelled')),
  starts_at timestamptz not null default now(),
  renews_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CREDIT ACCOUNT
-- Server-side mutations only.
-- ------------------------------------------------------------

create table if not exists public.credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0
    check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CREDIT LEDGER
-- Immutable commercial accounting trail.
-- ------------------------------------------------------------

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger(user_id, created_at desc);

-- ------------------------------------------------------------
-- DEFAULT PLANS
-- Prices intentionally conservative until checkout is wired.
-- ------------------------------------------------------------

insert into public.plans (
  code,
  name,
  credits,
  price_cents,
  currency
)
values
  ('free', 'MAGIS Free', 10, 0, 'USD'),
  ('starter', 'MAGIS Starter', 100, 900, 'USD'),
  ('pro', 'MAGIS Pro', 500, 2900, 'USD')
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- RLS
-- Every exposed public table gets RLS.
-- ------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.user_plans enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_ledger enable row level security;

-- ------------------------------------------------------------
-- PLANS
-- Plans are readable by authenticated users.
-- ------------------------------------------------------------

create policy "authenticated_can_read_active_plans"
on public.plans
for select
to authenticated
using (active = true);

-- ------------------------------------------------------------
-- PROFILES
-- ------------------------------------------------------------

create policy "users_can_read_own_profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "users_can_insert_own_profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "users_can_update_own_profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- ------------------------------------------------------------
-- USER PLANS
-- ------------------------------------------------------------

create policy "users_can_read_own_plan"
on public.user_plans
for select
to authenticated
using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- CREDIT ACCOUNTS
-- Read-only from client.
-- Writes stay server-side.
-- ------------------------------------------------------------

create policy "users_can_read_own_credit_account"
on public.credit_accounts
for select
to authenticated
using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- CREDIT LEDGER
-- Read-only from client.
-- Writes stay server-side.
-- ------------------------------------------------------------

create policy "users_can_read_own_credit_ledger"
on public.credit_ledger
for select
to authenticated
using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- UPDATED_AT
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists user_plans_set_updated_at on public.user_plans;

create trigger user_plans_set_updated_at
before update on public.user_plans
for each row
execute function public.set_updated_at();

drop trigger if exists credit_accounts_set_updated_at on public.credit_accounts;

create trigger credit_accounts_set_updated_at
before update on public.credit_accounts
for each row
execute function public.set_updated_at();

-- ------------------------------------------------------------
-- COMMERCIAL INDEXES
-- ------------------------------------------------------------

create index if not exists user_plans_plan_id_idx
  on public.user_plans(plan_id);

create index if not exists credit_accounts_updated_idx
  on public.credit_accounts(updated_at desc);

-- ------------------------------------------------------------
-- COMMENTS
-- ------------------------------------------------------------

comment on table public.plans is
  'MAGIS commercial plans and credit allowances';

comment on table public.profiles is
  'Commercial user profile linked to Supabase Auth';

comment on table public.user_plans is
  'Current commercial plan for each authenticated user';

comment on table public.credit_accounts is
  'Current available execution credits';

comment on table public.credit_ledger is
  'Immutable credit movement history';
