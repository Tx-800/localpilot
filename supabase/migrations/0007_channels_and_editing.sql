-- =====================================================================
-- 0007_channels_and_editing.sql — Per-channel text, hashtags, Google OAuth
--
-- content_queue:
--   hashtags     — kept apart from the caption body; appended for Instagram
--                  only, never sent to Google Business.
--   gbp_caption  — separate, hashtag-free Google Business Profile text
--                  (GBP summary limit is 1500 characters).
-- business_credentials:
--   google_refresh_token — long-lived token from "Connect Google"; a fresh
--                  access token is minted from it at publish time.
-- =====================================================================

alter table public.content_queue
  add column if not exists hashtags    text[] not null default '{}',
  add column if not exists gbp_caption text   not null default ''
    check (char_length(gbp_caption) <= 1500);

grant update (hashtags, gbp_caption) on public.content_queue to authenticated;

alter table public.business_credentials
  add column if not exists google_refresh_token text;

-- ---------------------------------------------------------------------
-- create_draft — now also stores hashtags + Google text.
-- Dropped first: a new defaulted parameter would otherwise leave two
-- overloads that PostgREST cannot choose between.
-- ---------------------------------------------------------------------
drop function if exists public.create_draft(uuid, text, text, text, timestamptz, jsonb);

create or replace function public.create_draft(
  p_business_id     uuid,
  p_caption         text,
  p_image_prompt    text,
  p_image_url       text,
  p_scheduled_for   timestamptz default null,
  p_generation_meta jsonb default '{}'::jsonb,
  p_hashtags        text[] default '{}',
  p_gbp_caption     text default ''
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
    (business_id, generated_caption, image_prompt, generated_image_url, scheduled_for, generation_meta,
     hashtags, gbp_caption)
  values
    (p_business_id, left(coalesce(p_caption, ''), 2200), p_image_prompt, p_image_url, p_scheduled_for,
     coalesce(p_generation_meta, '{}'::jsonb), coalesce(p_hashtags, '{}'), left(coalesce(p_gbp_caption, ''), 1500))
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.create_draft(uuid, text, text, text, timestamptz, jsonb, text[], text) from public, anon;
grant  execute on function public.create_draft(uuid, text, text, text, timestamptz, jsonb, text[], text) to authenticated, service_role;
