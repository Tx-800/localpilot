-- =====================================================================
-- 0001_schema.sql — Core multi-tenant schema
-- Multi-Tenant AI Local Marketing Automation Platform
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.review_status as enum ('pending_review', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.published_status as enum ('draft', 'processing', 'published', 'failed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles — extends auth.users (the admin / agency user)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text,
  agency_name  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- business_profiles — one row per client business (tenant)
-- ---------------------------------------------------------------------
create table if not exists public.business_profiles (
  id                       uuid primary key default gen_random_uuid(),
  agency_user_id           uuid not null references public.profiles (id) on delete cascade,
  business_name            text not null check (char_length(business_name) between 1 and 120),
  niche                    text not null check (char_length(niche) between 1 and 80),
  target_location          text not null check (char_length(target_location) between 1 and 120),
  brand_voice_style        text not null default 'Warm, friendly and local',
  target_keywords          text[] not null default '{}',

  -- Quota
  max_posts_per_month      integer not null default 12 check (max_posts_per_month between 0 and 1000),
  current_month_post_count integer not null default 0  check (current_month_post_count >= 0),
  quota_period_start       date not null default (date_trunc('month', now()))::date,

  -- Automation
  auto_generate_enabled    boolean not null default false,

  -- Channel identifiers (not secret). Secret tokens live in business_credentials.
  instagram_page_id        text,
  google_gbp_location_id   text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists business_profiles_agency_idx on public.business_profiles (agency_user_id);

create trigger business_profiles_set_updated_at
  before update on public.business_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- business_credentials — API tokens, readable ONLY by the service role.
-- (The spec's `google_gbp_token` placeholder lives here instead of on
--  business_profiles so it can never be selected from the browser.)
-- ---------------------------------------------------------------------
create table if not exists public.business_credentials (
  business_id             uuid primary key references public.business_profiles (id) on delete cascade,
  google_gbp_token        text,
  instagram_access_token  text,
  updated_at              timestamptz not null default now()
);

create trigger business_credentials_set_updated_at
  before update on public.business_credentials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- content_queue — generated drafts moving through the approval lifecycle
-- ---------------------------------------------------------------------
create table if not exists public.content_queue (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.business_profiles (id) on delete cascade,
  scheduled_for       timestamptz,
  generated_caption   text not null default '' check (char_length(generated_caption) <= 2200),
  image_prompt        text,
  generated_image_url text,
  review_status       public.review_status    not null default 'pending_review',
  published_status    public.published_status not null default 'draft',
  admin_notes         text,

  -- Bookkeeping for the publish pipeline
  external_post_ids   jsonb not null default '{}'::jsonb,
  last_error          text,
  quota_period_start  date,          -- month the publish slot was charged to
  approved_at         timestamptz,
  published_at        timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists content_queue_business_status_idx
  on public.content_queue (business_id, review_status, published_status);
create index if not exists content_queue_created_idx
  on public.content_queue (created_at desc);

create trigger content_queue_set_updated_at
  before update on public.content_queue
  for each row execute function public.set_updated_at();
