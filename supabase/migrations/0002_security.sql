-- =====================================================================
-- 0002_security.sql — Row Level Security + column-level privileges
--
-- Principle: the browser/session client may READ its own tenants and
-- EDIT only "safe" columns. Every state transition that touches quota
-- (draft creation, publish, refund) goes through SECURITY DEFINER
-- functions in 0003, so quota can't be bypassed from the client.
-- =====================================================================

alter table public.profiles             enable row level security;
alter table public.business_profiles    enable row level security;
alter table public.business_credentials enable row level security;
alter table public.content_queue        enable row level security;

-- Anonymous users get nothing.
revoke all on public.profiles, public.business_profiles,
              public.business_credentials, public.content_queue from anon;

-- ---------------------------------------------------------------------
-- Ownership helper (used by policies; avoids repeated sub-selects)
-- ---------------------------------------------------------------------
create or replace function public.owns_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_profiles b
    where b.id = p_business_id and b.agency_user_id = (select auth.uid())
  );
$$;

revoke execute on function public.owns_business(uuid) from public, anon;
grant  execute on function public.owns_business(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from authenticated;
grant  update (full_name, agency_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- business_profiles
-- ---------------------------------------------------------------------
drop policy if exists "business: read own"   on public.business_profiles;
drop policy if exists "business: insert own" on public.business_profiles;
drop policy if exists "business: update own" on public.business_profiles;
drop policy if exists "business: delete own" on public.business_profiles;

create policy "business: read own" on public.business_profiles
  for select to authenticated using (agency_user_id = (select auth.uid()));

create policy "business: insert own" on public.business_profiles
  for insert to authenticated with check (agency_user_id = (select auth.uid()));

create policy "business: update own" on public.business_profiles
  for update to authenticated
  using (agency_user_id = (select auth.uid()))
  with check (agency_user_id = (select auth.uid()));

create policy "business: delete own" on public.business_profiles
  for delete to authenticated using (agency_user_id = (select auth.uid()));

-- Column-level: quota counters are NOT writable from the client.
revoke insert, update on public.business_profiles from authenticated;

grant insert (agency_user_id, business_name, niche, target_location, brand_voice_style,
              target_keywords, max_posts_per_month, auto_generate_enabled,
              instagram_page_id, google_gbp_location_id)
  on public.business_profiles to authenticated;

grant update (business_name, niche, target_location, brand_voice_style,
              target_keywords, max_posts_per_month, auto_generate_enabled,
              instagram_page_id, google_gbp_location_id)
  on public.business_profiles to authenticated;

-- ---------------------------------------------------------------------
-- business_credentials — service role only (no policies => no access)
-- ---------------------------------------------------------------------
revoke all on public.business_credentials from authenticated;

-- ---------------------------------------------------------------------
-- content_queue
-- ---------------------------------------------------------------------
drop policy if exists "content: read own"          on public.content_queue;
drop policy if exists "content: edit open drafts"  on public.content_queue;
drop policy if exists "content: delete unpublished" on public.content_queue;

create policy "content: read own" on public.content_queue
  for select to authenticated using (public.owns_business(business_id));

-- Edits allowed only while the item is still a draft (or a failed publish awaiting retry).
create policy "content: edit open drafts" on public.content_queue
  for update to authenticated
  using (
    public.owns_business(business_id)
    and review_status <> 'rejected'
    and published_status in ('draft', 'failed')
  )
  with check (public.owns_business(business_id));

create policy "content: delete unpublished" on public.content_queue
  for delete to authenticated
  using (
    public.owns_business(business_id)
    and published_status in ('draft', 'failed')
  );

-- No direct inserts; status columns not writable. Use the RPCs in 0003.
revoke insert, update on public.content_queue from authenticated;

grant update (generated_caption, admin_notes, scheduled_for, image_prompt, generated_image_url)
  on public.content_queue to authenticated;
