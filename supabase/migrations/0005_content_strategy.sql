-- =====================================================================
-- 0005_content_strategy.sql — Per-business generation strategy + history
--
-- business_profiles gains three client-editable strategy fields that are
-- injected into every caption / image prompt for that business.
-- content_queue gains generation_meta: which pillar / format / visual
-- direction a draft used, so the next draft can rotate away from it.
-- =====================================================================

alter table public.business_profiles
  add column if not exists content_pillars      text[] not null default '{}',
  add column if not exists caption_instructions text   not null default ''
    check (char_length(caption_instructions) <= 2000),
  add column if not exists image_style          text   not null default ''
    check (char_length(image_style) <= 1000);

alter table public.content_queue
  add column if not exists generation_meta jsonb not null default '{}'::jsonb;

-- Strategy columns are client-writable like the rest of the profile.
grant insert (content_pillars, caption_instructions, image_style)
  on public.business_profiles to authenticated;
grant update (content_pillars, caption_instructions, image_style)
  on public.business_profiles to authenticated;

-- ---------------------------------------------------------------------
-- create_draft — now also records generation_meta.
-- Dropped first: adding a defaulted parameter would otherwise leave two
-- overloads that PostgREST cannot choose between.
-- ---------------------------------------------------------------------
drop function if exists public.create_draft(uuid, text, text, text, timestamptz);

create or replace function public.create_draft(
  p_business_id     uuid,
  p_caption         text,
  p_image_prompt    text,
  p_image_url       text,
  p_scheduled_for   timestamptz default null,
  p_generation_meta jsonb default '{}'::jsonb
)
returns public.content_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_biz  public.business_profiles;
  v_open integer;
  v_row  public.content_queue;
begin
  v_biz := public._lock_business_for_quota(p_business_id);

  select count(*) into v_open
  from public.content_queue
  where business_id = p_business_id
    and review_status <> 'rejected'
    and published_status in ('draft', 'processing', 'failed');

  if v_biz.current_month_post_count + v_open >= v_biz.max_posts_per_month then
    raise exception 'QUOTA_EXCEEDED: % published + % open drafts of % allowed this month',
      v_biz.current_month_post_count, v_open, v_biz.max_posts_per_month
      using errcode = 'P0001';
  end if;

  insert into public.content_queue
    (business_id, generated_caption, image_prompt, generated_image_url, scheduled_for, generation_meta)
  values
    (p_business_id, left(coalesce(p_caption, ''), 2200), p_image_prompt, p_image_url, p_scheduled_for,
     coalesce(p_generation_meta, '{}'::jsonb))
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.create_draft(uuid, text, text, text, timestamptz, jsonb) from public, anon;
grant  execute on function public.create_draft(uuid, text, text, text, timestamptz, jsonb) to authenticated, service_role;
