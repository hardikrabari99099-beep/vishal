-- =====================================================================
-- IndiFunded core schema for Supabase (PostgreSQL)
--
-- SAFE TO RE-RUN: every statement is "create if not exists" or additive.
-- This file NEVER drops, truncates, deletes or overwrites any table or row.
--
-- What the app needs (matches src/server/api-handler.js):
--   public.docs        One JSON document per row, grouped by "collection":
--                      users, trader_accounts, orders, payout_requests,
--                      plans, coupons, blogs, certificates, settings, ...
--   public.user_roles  Which Supabase Auth users are admins.
--
-- Security model: ONLY the server (using the Supabase secret key) reads or
-- writes public.docs. Row Level Security is ON with NO browser policies,
-- and browser roles (anon / authenticated) get no access at all.
-- =====================================================================

-- 1) Role type used by user_roles -----------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'app_role' and n.nspname = 'public'
  ) then
    create type public.app_role as enum ('admin', 'user');
  end if;
end
$$;

-- 2) user_roles ------------------------------------------------------------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_roles' and policyname = 'Users read own roles'
  ) then
    create policy "Users read own roles" on public.user_roles
      for select to authenticated using (auth.uid() = user_id);
  end if;
end
$$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- 3) docs (the document store) --------------------------------------------
create table if not exists public.docs (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (collection, id)
);

-- additive: track last change time (harmless for existing rows)
alter table public.docs add column if not exists updated_at timestamptz not null default now();

create index if not exists docs_collection_idx on public.docs (collection);

create or replace function public.docs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'docs_set_updated_at' and tgrelid = 'public.docs'::regclass
  ) then
    create trigger docs_set_updated_at
      before update on public.docs
      for each row execute function public.docs_set_updated_at();
  end if;
end
$$;

-- 4) lock docs down to the server only ------------------------------------
alter table public.docs enable row level security;
revoke all on public.docs from anon, authenticated;
grant all on public.docs to service_role;
-- (No RLS policies are created on purpose: browsers can never read or write docs.)
