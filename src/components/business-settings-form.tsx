'use client';

import { useActionState, useState, useTransition } from 'react';
import { disconnectGoogle, saveBusinessProfile, type BusinessFormState, type CredentialStatus } from '@/actions/business';
import type { BusinessProfile } from '@/lib/types';
import { GoogleLocationPicker } from './google-location-picker';

const VOICES = [
  'Warm, friendly and local',
  'Bold, energetic and motivating',
  'Elegant, minimal and premium',
  'Playful, witty and casual',
  'Expert, trustworthy and calm',
];

export function BusinessSettingsForm({
  business,
  credentialStatus,
  googleOAuthEnabled = false,
}: {
  business?: BusinessProfile;
  credentialStatus?: CredentialStatus;
  googleOAuthEnabled?: boolean;
}) {
  const [state, action, pending] = useActionState<BusinessFormState | null, FormData>(saveBusinessProfile, null);
  const fe: Record<string, string> = (state && !state.ok && state.fieldErrors) || {};
  const [disconnecting, startDisconnect] = useTransition();
  const [disconnectMsg, setDisconnectMsg] = useState<string | null>(null);
  const googleSource: 'client' | 'agency' | null = credentialStatus?.googleConnected
    ? 'client'
    : credentialStatus?.agencyGoogle.connected
      ? 'agency'
      : null;

  return (
    <form action={action} className="space-y-8 lg:space-y-10">
      {business && <input type="hidden" name="id" value={business.id} />}

      {/* Identity */}
      <Section title="Business identity" hint="Injected into every AI prompt for this client.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" name="business_name" error={fe.business_name}>
            <input id="business_name" name="business_name" defaultValue={business?.business_name} required maxLength={120} className="input" placeholder="Brew & Bloom Café" />
          </Field>
          <Field label="Niche" name="niche" error={fe.niche}>
            <input id="niche" name="niche" defaultValue={business?.niche} required maxLength={80} className="input" placeholder="Specialty coffee shop" />
          </Field>
          <Field label="Target location" name="target_location" error={fe.target_location}>
            <input id="target_location" name="target_location" defaultValue={business?.target_location} required className="input" placeholder="Powai, Mumbai" />
          </Field>
          <Field label="Brand voice" name="brand_voice_style">
            <input id="brand_voice_style" name="brand_voice_style" list="voices" defaultValue={business?.brand_voice_style ?? VOICES[0]} className="input" />
            <datalist id="voices">{VOICES.map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
          <Field label="Target local keywords" name="target_keywords" hint="Comma or line separated, up to 20" className="sm:col-span-2">
            <textarea id="target_keywords" name="target_keywords" rows={2} defaultValue={business?.target_keywords.join(', ')} className="input" placeholder="best coffee in Powai, cafe near Hiranandani, work-friendly cafe" />
          </Field>
        </div>
      </Section>

      {/* Per-business generation strategy */}
      <Section title="Content strategy" hint="Custom AI instructions for this client. Each new draft rotates to a different pillar, post format and photo composition, and avoids repeating recent posts.">
        <div className="grid gap-4">
          <Field label="Content pillars" name="content_pillars" error={fe.content_pillars} hint="One topic per line, up to 15. Drafts cycle through them. Leave empty to use general topics.">
            <textarea id="content_pillars" name="content_pillars" rows={5} defaultValue={business?.content_pillars.join('\n')} className="input" placeholder={'New seasonal drinks\nOur baristas and their craft\nCustomer reviews and favourites\nWork-friendly space and Wi-Fi\nLocal events in Powai'} />
          </Field>
          <Field label="Caption instructions" name="caption_instructions" error={fe.caption_instructions} hint="How captions should be written: language, must-mention details, call to action, words to avoid. Max 2000 characters.">
            <textarea id="caption_instructions" name="caption_instructions" rows={4} maxLength={2000} defaultValue={business?.caption_instructions} className="input" placeholder="Write in light Hinglish. Always mention we open at 8 am. End with 'Book a table via DM'. Never use the word 'cheap'." />
          </Field>
          <Field label="Image style" name="image_style" error={fe.image_style} hint="How pictures should look: colours, props, setting, mood. Max 1000 characters.">
            <textarea id="image_style" name="image_style" rows={3} maxLength={1000} defaultValue={business?.image_style} className="input" placeholder="Warm earthy tones, terracotta and sage green, wooden tables, plants in the background, soft natural light." />
          </Field>
        </div>
      </Section>

      {/* Quota + automation */}
      <Section title="Quota & automation" hint="Hard cap enforced in the database on every draft and publish.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max posts per month" name="max_posts_per_month" error={fe.max_posts_per_month}>
            <input id="max_posts_per_month" name="max_posts_per_month" type="number" inputMode="numeric" min={0} max={1000} step={1} required defaultValue={business?.max_posts_per_month ?? 12} className="input tabular-nums" />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 p-3.5 transition-colors hover:border-ink-300 has-[:checked]:border-brand-200 has-[:checked]:bg-brand-50/50 sm:mt-7">
            <input type="checkbox" name="auto_generate_enabled" defaultChecked={business?.auto_generate_enabled ?? false} className="mt-0.5 size-4 accent-brand-600" />
            <span className="text-sm">
              <span className="font-medium">Auto-generate drafts</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">Scheduled job creates drafts for review. Nothing is ever posted without your approval.</span>
            </span>
          </label>
        </div>
      </Section>

      {/* Channels */}
      <Section title="Connected channels" hint="Where approved posts go. Tokens are write-only and stored server-side; leave a token box blank to keep the saved one, or type __clear__ to remove it.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instagram account ID" name="instagram_page_id">
            <input id="instagram_page_id" name="instagram_page_id" defaultValue={business?.instagram_page_id ?? ''} className="input font-mono text-xs" placeholder="17841400000000000" />
          </Field>
          <Field label="Instagram access token" name="instagram_access_token" hint={credentialStatus?.instagram ? '● Token saved' : 'Not set'}>
            <input id="instagram_access_token" name="instagram_access_token" type="password" autoComplete="off" className="input font-mono text-xs" placeholder={credentialStatus?.instagram ? '••••••••' : 'EAAG…'} />
          </Field>
        </div>

        {/* Google Business Profile: which Google account is used + which locations */}
        <div className="mt-6 border-t border-ink-100 pt-6">
          <div className="flex flex-col gap-3 rounded-xl border border-ink-200/80 bg-ink-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className={`mt-1 size-2.5 shrink-0 rounded-full ${googleSource ? 'bg-emerald-500' : 'bg-ink-300'}`} />
              <div>
                <p className="text-sm font-semibold text-ink-900">
                  {googleSource === 'client'
                    ? 'Google: this client’s own account'
                    : googleSource === 'agency'
                      ? 'Google: your agency account'
                      : 'Google not connected'}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                  {googleSource === 'client'
                    ? 'Posts use the Google account connected below under Advanced.'
                    : googleSource === 'agency'
                      ? `Using ${credentialStatus?.agencyGoogle.email ?? 'the Google account'} connected on My Profile. Pick this client’s locations below.`
                      : !googleOAuthEnabled
                        ? 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable Google.'
                        : 'Connect your agency’s Google account once on My Profile — it works for every client.'}
                </p>
              </div>
            </div>
            {googleOAuthEnabled && !googleSource && (
              <a href="/dashboard/profile#google" className="btn-primary shrink-0">
                Go to My Profile
              </a>
            )}
          </div>

          <div className="mt-5">
            <GoogleLocationPicker
              businessId={business?.id}
              initial={
                business?.google_locations?.length
                  ? business.google_locations
                  : business?.google_gbp_location_id
                    ? [{ name: business.google_gbp_location_id, title: business.google_gbp_location_id }]
                    : []
              }
              canLoad={!!googleSource && googleOAuthEnabled}
              error={fe.google_locations}
            />
          </div>

          <details className="mt-5 rounded-xl border border-ink-200/80 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-600 hover:text-ink-900">
              Advanced: use a different Google account for this client
            </summary>
            <div className="mt-4 space-y-4">
              {googleOAuthEnabled && business ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`/api/google/connect?businessId=${business.id}`} className="btn-secondary">
                    {credentialStatus?.googleConnected ? 'Reconnect client’s Google' : 'Connect client’s own Google'}
                  </a>
                  {credentialStatus?.googleConnected && (
                    <button
                      type="button"
                      onClick={() => startDisconnect(async () => setDisconnectMsg((await disconnectGoogle(business.id)).ok ? 'Disconnected — the agency account is used again' : 'Could not disconnect'))}
                      disabled={disconnecting}
                      className="btn-ghost"
                    >
                      {disconnecting ? 'Disconnecting…' : 'Disconnect client’s Google'}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-ink-500">{business ? 'Google sign-in is not configured on the server.' : 'Save the client first.'}</p>
              )}
              {disconnectMsg && <p className="hint">{disconnectMsg}</p>}
              <Field
                label="Google access token (fallback)"
                name="google_gbp_token"
                hint={credentialStatus?.google ? '● Token saved — only used when no Google account is connected; expires after 1 hour' : 'Rarely needed. Expires after 1 hour.'}
              >
                <input id="google_gbp_token" name="google_gbp_token" type="password" autoComplete="off" className="input font-mono text-xs" placeholder={credentialStatus?.google ? '••••••••' : 'ya29…'} />
              </Field>
            </div>
          </details>
        </div>
      </Section>

      {/* Sticky save bar — always reachable while scrolling a long form */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-ink-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:bottom-4 sm:mx-0 sm:rounded-2xl sm:border sm:shadow-lift">
        <div className="flex items-center justify-end gap-3">
          {state ? (
            <p role="status" className={`mr-auto text-sm font-medium ${state.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              {state.ok ? state.message : state.error}
            </p>
          ) : (
            <p className="mr-auto hidden text-sm text-ink-500 sm:block">Changes apply to the next generated draft.</p>
          )}
          <button type="submit" disabled={pending} className="btn-primary px-6">
            {pending ? 'Saving…' : business ? 'Save settings' : 'Create client'}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Settings section: description column on the left (desktop), fields card on the right. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[17rem_1fr] lg:gap-10">
      <div className="lg:pt-5">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {hint && <p className="mt-1 text-sm leading-relaxed text-ink-500">{hint}</p>}
      </div>
      <div className="card p-5 sm:p-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  hint,
  error,
  className = '',
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">{label}</label>
      {children}
      {error ? <p className="hint font-medium text-red-600">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}
