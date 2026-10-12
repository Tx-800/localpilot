-- =====================================================================
-- 0008_agency_google_locations.sql — One Google login for the agency,
-- many Business Profile locations per client
--
-- agency_credentials: the agency user's Google refresh token (connected
--   once on My Profile). Service-role only, like business_credentials.
-- business_profiles.google_locations: the Business Profile locations a
--   client posts to, picked from the agency's Google account:
--   [{ "name": "accounts/1/locations/2", "title": "Café – Powai", "address": "…" }]
--   The legacy single google_gbp_location_id is still honoured when empty.
-- =====================================================================

create table if not exists public.agency_credentials (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  google_refresh_token text,
  google_email         text,
  updated_at           timestamptz not null default now()
);

create trigger agency_credentials_set_updated_at
  before update on public.agency_credentials
  for each row execute function public.set_updated_at();

-- No policies => only the service role can read or write tokens.
alter table public.agency_credentials enable row level security;
revoke all on public.agency_credentials from anon, authenticated;

alter table public.business_profiles
  add column if not exists google_locations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(google_locations) = 'array' and jsonb_array_length(google_locations) <= 50);

grant insert (google_locations) on public.business_profiles to authenticated;
grant update (google_locations) on public.business_profiles to authenticated;
