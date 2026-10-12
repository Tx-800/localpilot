import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';

/**
 * "Connect Google" for Google Business Profile posting.
 * The user approves once; we keep the refresh token and mint a short-lived
 * access token (1 hour) each time a post is published.
 */

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/business.manage';
const STATE_TTL_MS = 15 * 60 * 1000;

// State = base64url(json).signature — binds the callback to the user + business that started it.
function sign(payload: string): string {
  return createHmac('sha256', env.serviceRoleKey()).update(`google-oauth:${payload}`).digest('base64url');
}

export function createState(data: { businessId: string; userId: string }): string {
  const payload = Buffer.from(JSON.stringify({ ...data, ts: Date.now() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readState(state: string): { businessId: string; userId: string } | null {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { businessId: string; userId: string; ts: number };
    if (Date.now() - data.ts > STATE_TTL_MS) return null;
    return { businessId: data.businessId, userId: data.userId };
  } catch {
    return null;
  }
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline', // → refresh token
    prompt: 'consent', // always return a refresh token, even on re-connect
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

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const { ok, json } = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  if (!ok || !json.refresh_token) {
    throw new AppError('PROVIDER_ERROR', `Google did not return a refresh token: ${json.error_description ?? json.error ?? 'unknown error'}`);
  }
  return json.refresh_token;
}

/** Access token for publishing: from the refresh token when connected, else a pasted access token. */
export async function googleAccessToken(creds: { google_refresh_token: string | null; google_gbp_token: string | null }): Promise<string> {
  if (creds.google_refresh_token) {
    if (!env.googleOAuthEnabled()) {
      throw new Error('Google Business: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on the server');
    }
    const { ok, json } = await tokenRequest({ grant_type: 'refresh_token', refresh_token: creds.google_refresh_token });
    if (!ok || !json.access_token) {
      throw new Error(
        json.error === 'invalid_grant'
          ? 'Google Business: the Google connection was revoked or expired — reconnect Google in Client Settings'
          : `Google Business: could not refresh access (${json.error_description ?? json.error ?? 'unknown error'})`,
      );
    }
    return json.access_token;
  }
  if (creds.google_gbp_token) return creds.google_gbp_token;
  throw new Error('Google Business: not connected');
}
