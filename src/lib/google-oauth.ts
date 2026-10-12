import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import type { GoogleLocation } from '@/lib/types';

/**
 * Google Business Profile access.
 *  - Agency connection: the agency user connects one Google account (a manager on
 *    many Business Profiles) on My Profile; every client uses it.
 *  - Client connection (optional override): a client's own Google account.
 * We keep refresh tokens and mint a short-lived access token per request.
 */

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/business.manage', 'openid', 'email'];
const STATE_TTL_MS = 15 * 60 * 1000;

export type OAuthTarget = { kind: 'agency'; userId: string } | { kind: 'business'; userId: string; businessId: string };

// State = base64url(json).signature — binds the callback to the user (+ business) that started it.
function sign(payload: string): string {
  return createHmac('sha256', env.serviceRoleKey()).update(`google-oauth:${payload}`).digest('base64url');
}

export function createState(target: OAuthTarget): string {
  const payload = Buffer.from(JSON.stringify({ ...target, ts: Date.now() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readState(state: string): OAuthTarget | null {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as OAuthTarget & { ts: number };
    if (Date.now() - data.ts > STATE_TTL_MS) return null;
    return data.kind === 'agency'
      ? { kind: 'agency', userId: data.userId }
      : { kind: 'business', userId: data.userId, businessId: data.businessId };
  } catch {
    return null;
  }
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline', // → refresh token
    prompt: 'consent select_account', // always return a refresh token; let the user pick the account
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.googleClientId(), client_secret: env.googleClientSecret(), ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  return { ok: res.ok, json };
}

/** Exchange the consent code; returns the refresh token and the Google account's email. */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string; email: string | null }> {
  const { ok, json } = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  if (!ok || !json.refresh_token) {
    throw new AppError('PROVIDER_ERROR', `Google did not return a refresh token: ${json.error_description ?? json.error ?? 'unknown error'}`);
  }
  let email: string | null = null;
  if (json.access_token) {
    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${json.access_token}` },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    email = ((await info?.json().catch(() => null)) as { email?: string } | null)?.email ?? null;
  }
  return { refreshToken: json.refresh_token, email };
}

async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  if (!env.googleOAuthEnabled()) {
    throw new Error('Google Business: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on the server');
  }
  const { ok, json } = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  if (!ok || !json.access_token) {
    throw new Error(
      json.error === 'invalid_grant'
        ? 'Google Business: the Google connection was revoked or expired — reconnect Google'
        : `Google Business: could not refresh access (${json.error_description ?? json.error ?? 'unknown error'})`,
    );
  }
  return json.access_token;
}

/** The agency user's stored Google connection, if any (service role). */
export async function getAgencyGoogle(userId: string): Promise<{ refreshToken: string; email: string | null } | null> {
  const { data } = await createAdminClient()
    .from('agency_credentials')
    .select('google_refresh_token, google_email')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.google_refresh_token ? { refreshToken: data.google_refresh_token, email: data.google_email } : null;
}

/**
 * Access token used to post for a client, in order of preference:
 *  1. the client's own Google connection, 2. the agency's connection, 3. a pasted access token.
 */
export async function googleAccessTokenForBusiness(
  creds: { google_refresh_token: string | null; google_gbp_token: string | null } | null,
  agencyUserId: string,
): Promise<string> {
  if (creds?.google_refresh_token) return accessTokenFromRefresh(creds.google_refresh_token);
  const agency = await getAgencyGoogle(agencyUserId);
  if (agency) return accessTokenFromRefresh(agency.refreshToken);
  if (creds?.google_gbp_token) return creds.google_gbp_token;
  throw new Error('Google Business: not connected — connect Google on My Profile or in Client Settings');
}

export async function hasGoogleAccess(
  creds: { google_refresh_token: string | null; google_gbp_token: string | null } | null,
  agencyUserId: string,
): Promise<boolean> {
  return !!(creds?.google_refresh_token || creds?.google_gbp_token || (await getAgencyGoogle(agencyUserId)));
}

// ---- Location discovery -----------------------------------------------------

type GoogleListPage<K extends string, T> = { [key in K]?: T[] } & { nextPageToken?: string; error?: { message?: string } };

async function listAll<K extends string, T>(url: string, key: K, accessToken: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken = '';
  for (let page = 0; page < 20; page++) {
    const u = new URL(url);
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20_000) });
    const json = (await res.json().catch(() => ({}))) as GoogleListPage<K, T>;
    if (!res.ok) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      throw new AppError(
        'PROVIDER_ERROR',
        res.status === 429 || /quota/i.test(msg)
          ? `Google Business Profile API access is not approved for this Google Cloud project yet (${msg})`
          : `Google: ${msg}`,
      );
    }
    out.push(...((json[key] as T[] | undefined) ?? []));
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return out;
}

/** Every Business Profile location the Google account can manage, across all its accounts and groups. */
export async function listManagedLocations(accessToken: string): Promise<GoogleLocation[]> {
  const accounts = await listAll<'accounts', { name: string }>(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20',
    'accounts',
    accessToken,
  );
  const seen = new Set<string>();
  const out: GoogleLocation[] = [];
  for (const account of accounts) {
    const locations = await listAll<'locations', { name: string; title?: string; storefrontAddress?: { addressLines?: string[]; locality?: string } }>(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?pageSize=100&readMask=name,title,storefrontAddress`,
      'locations',
      accessToken,
    );
    for (const loc of locations) {
      const locationId = loc.name.split('/').pop();
      if (!locationId || seen.has(locationId)) continue; // same location can appear under several accounts
      seen.add(locationId);
      const addr = loc.storefrontAddress;
      out.push({
        name: `${account.name}/locations/${locationId}`,
        title: loc.title ?? `Location ${locationId}`,
        address: [...(addr?.addressLines ?? []), addr?.locality].filter(Boolean).join(', ') || undefined,
      });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export { accessTokenFromRefresh };
