-- =====================================================================
-- 0006_profile_signup_fields.sql — Collect agency name at sign-up
--
-- The sign-up form now sends full_name and agency_name as user metadata;
-- the new-user trigger copies both into public.profiles. Length caps keep
-- the self-editable profile fields sane.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, agency_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), 120),
    left(nullif(trim(new.raw_user_meta_data ->> 'agency_name'), ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.profiles
  drop constraint if exists profiles_full_name_len,
  drop constraint if exists profiles_agency_name_len;

alter table public.profiles
  add constraint profiles_full_name_len   check (full_name   is null or char_length(full_name)   <= 120),
  add constraint profiles_agency_name_len check (agency_name is null or char_length(agency_name) <= 120);
