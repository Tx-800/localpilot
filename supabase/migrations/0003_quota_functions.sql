-- =====================================================================
-- 0003_quota_functions.sql — Atomic quota + lifecycle transitions
--
-- Quota model (per business, per calendar month, UTC):
--   used  = current_month_post_count   (incremented on publish)
--   open  = drafts not yet published or rejected
--   * create_draft      : allowed only if used + open < max
--   * claim_publish_slot: atomically reserves a slot (used + 1) BEFORE
--                         calling Meta/Google, so two concurrent clicks
--                         can never exceed the cap
--   * finalize_publish  : marks published, or refunds the slot on failure
--
-- Months roll over lazily: the first quota-touching call in a new month
-- resets the counter. No scheduler required.
--
-- All functions lock the business row (FOR UPDATE) so checks + writes
-- happen in one transaction. Callers: `authenticated` (ownership enforced
-- via auth.uid()) and `service_role` (cron; auth.uid() is null).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internal: lock business, verify ownership, roll quota period.
-- ---------------------------------------------------------------------
create or replace function public._lock_business_for_quota(p_business_id uuid)
returns public.business_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_biz    public.business_profiles;
  v_period date := (date_trunc('month', now()))::date;
begin
  select * into v_biz
  from public.business_profiles
  where id = p_business_id
  for update;

  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  if auth.uid() is not null and v_biz.agency_user_id <> auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_biz.quota_period_start < v_period then
    update public.business_profiles
       set current_month_post_count = 0,
           quota_period_start       = v_period
     where id = p_business_id
    returning * into v_biz;
  end if;

  return v_biz;
end;
$$;

revoke execute on function public._lock_business_for_quota(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- create_draft — quota-checked insert of a pending_review draft
-- ---------------------------------------------------------------------
create or replace function public.create_draft(
  p_business_id   uuid,
  p_caption       text,
  p_image_prompt  text,
  p_image_url     text,
  p_scheduled_for timestamptz default null
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
    (business_id, generated_caption, image_prompt, generated_image_url, scheduled_for)
  values
    (p_business_id, left(coalesce(p_caption, ''), 2200), p_image_prompt, p_image_url, p_scheduled_for)
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- claim_publish_slot — validate + atomically increment the counter
-- ---------------------------------------------------------------------
create or replace function public.claim_publish_slot(p_content_id uuid)
returns public.content_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_queue;
  v_biz  public.business_profiles;
begin
  select * into v_item from public.content_queue where id = p_content_id for update;
  if not found then
    raise exception 'CONTENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_biz := public._lock_business_for_quota(v_item.business_id);

  if v_item.review_status = 'rejected' then
    raise exception 'INVALID_STATE: draft was rejected' using errcode = 'P0001';
  end if;
  if v_item.published_status not in ('draft', 'failed') then
    raise exception 'INVALID_STATE: item is already %', v_item.published_status using errcode = 'P0001';
  end if;
  if coalesce(btrim(v_item.generated_caption), '') = '' then
    raise exception 'VALIDATION: caption is empty' using errcode = 'P0001';
  end if;
  if v_item.generated_image_url is null then
    raise exception 'VALIDATION: image is missing' using errcode = 'P0001';
  end if;

  if v_biz.current_month_post_count >= v_biz.max_posts_per_month then
    raise exception 'QUOTA_EXCEEDED: monthly cap of % posts reached', v_biz.max_posts_per_month
      using errcode = 'P0001';
  end if;

  -- Atomic increment (row is locked; the guard repeats the cap for defence in depth)
  update public.business_profiles
     set current_month_post_count = current_month_post_count + 1
   where id = v_biz.id
     and current_month_post_count < max_posts_per_month;

  if not found then
    raise exception 'QUOTA_EXCEEDED: monthly cap reached' using errcode = 'P0001';
  end if;

  update public.content_queue
     set review_status      = 'approved',
         published_status   = 'processing',
         approved_at        = now(),
         quota_period_start = v_biz.quota_period_start,
         last_error         = null
   where id = p_content_id
  returning * into v_item;

  return v_item;
end;
$$;

-- ---------------------------------------------------------------------
-- finalize_publish — mark published, or mark failed and refund the slot
-- ---------------------------------------------------------------------
create or replace function public.finalize_publish(
  p_content_id   uuid,
  p_success      boolean,
  p_external_ids jsonb default '{}'::jsonb,
  p_error        text  default null
)
returns public.content_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_queue;
  v_biz  public.business_profiles;
begin
  select * into v_item from public.content_queue where id = p_content_id for update;
  if not found then
    raise exception 'CONTENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_biz from public.business_profiles where id = v_item.business_id for update;
  if auth.uid() is not null and v_biz.agency_user_id <> auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_item.published_status <> 'processing' then
    raise exception 'INVALID_STATE: item is %', v_item.published_status using errcode = 'P0001';
  end if;

  if p_success then
    update public.content_queue
       set published_status  = 'published',
           published_at      = now(),
           external_post_ids = coalesce(p_external_ids, '{}'::jsonb),
           last_error        = p_error            -- partial-channel warnings, if any
     where id = p_content_id
    returning * into v_item;
  else
    -- Refund only if the slot was charged to the still-current period.
    update public.business_profiles
       set current_month_post_count = greatest(current_month_post_count - 1, 0)
     where id = v_item.business_id
       and quota_period_start = v_item.quota_period_start;

    update public.content_queue
       set published_status  = 'failed',
           external_post_ids = coalesce(p_external_ids, '{}'::jsonb),
           last_error        = left(coalesce(p_error, 'Unknown publish error'), 2000)
     where id = p_content_id
    returning * into v_item;
  end if;

  return v_item;
end;
$$;

-- ---------------------------------------------------------------------
-- reject_draft
-- ---------------------------------------------------------------------
create or replace function public.reject_draft(p_content_id uuid, p_notes text default null)
returns public.content_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_queue;
begin
  select * into v_item from public.content_queue where id = p_content_id for update;
  if not found then
    raise exception 'CONTENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if auth.uid() is not null and not public.owns_business(v_item.business_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_item.published_status not in ('draft', 'failed') then
    raise exception 'INVALID_STATE: item is %', v_item.published_status using errcode = 'P0001';
  end if;

  update public.content_queue
     set review_status = 'rejected',
         admin_notes   = coalesce(p_notes, admin_notes)
   where id = p_content_id
  returning * into v_item;

  return v_item;
end;
$$;

-- ---------------------------------------------------------------------
-- Recovery: release items stuck in 'processing' (e.g. server crashed
-- mid-publish). Service role only; call from a cron if desired.
-- ---------------------------------------------------------------------
create or replace function public.release_stuck_publishes(p_older_than interval default interval '15 minutes')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_item  public.content_queue;
begin
  for v_item in
    select * from public.content_queue
    where published_status = 'processing'
      and updated_at < now() - p_older_than
    for update skip locked
  loop
    update public.business_profiles
       set current_month_post_count = greatest(current_month_post_count - 1, 0)
     where id = v_item.business_id
       and quota_period_start = v_item.quota_period_start;

    update public.content_queue
       set published_status = 'failed',
           last_error = 'Publish timed out; slot refunded. Verify on the platform before retrying.'
     where id = v_item.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
revoke execute on function public.create_draft(uuid, text, text, text, timestamptz) from public, anon;
revoke execute on function public.claim_publish_slot(uuid)                        from public, anon;
revoke execute on function public.finalize_publish(uuid, boolean, jsonb, text)    from public, anon;
revoke execute on function public.reject_draft(uuid, text)                        from public, anon;
revoke execute on function public.release_stuck_publishes(interval)               from public, anon, authenticated;

grant execute on function public.create_draft(uuid, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.claim_publish_slot(uuid)                        to authenticated, service_role;
grant execute on function public.finalize_publish(uuid, boolean, jsonb, text)    to authenticated, service_role;
grant execute on function public.reject_draft(uuid, text)                        to authenticated, service_role;
grant execute on function public.release_stuck_publishes(interval)               to service_role;
