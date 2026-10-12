'use client';

import { useActionState } from 'react';
import { saveBusinessProfile, type BusinessFormState } from '@/actions/business';
import type { BusinessProfile } from '@/lib/types';

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
}: {
  business?: BusinessProfile;
  credentialStatus?: { instagram: boolean; google: boolean };
}) {
  const [state, action, pending] = useActionState<BusinessFormState | null, FormData>(saveBusinessProfile, null);
  const fe: Record<string, string> = (state && !state.ok && state.fieldErrors) || {};

  return (
    <form action={action} className="space-y-6">
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
          <label className="flex items-start gap-3 rounded-lg border border-ink-200 p-3 sm:mt-6">
            <input type="checkbox" name="auto_generate_enabled" defaultChecked={business?.auto_generate_enabled ?? false} className="mt-0.5 size-4 accent-brand-600" />
            <span className="text-sm">
              <span className="font-medium">Auto-generate drafts</span>
              <span className="block text-xs text-ink-500">Scheduled job creates drafts for review. Nothing is ever posted without your approval.</span>
            </span>
          </label>
        </div>
      </Section>

      {/* Channels */}
      <Section title="Connected channels" hint="Tokens are write-only and stored server-side. Leave blank to keep the current value; type __clear__ to remove.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instagram account ID" name="instagram_page_id">
            <input id="instagram_page_id" name="instagram_page_id" defaultValue={business?.instagram_page_id ?? ''} className="input font-mono text-xs" placeholder="17841400000000000" />
          </Field>
          <Field label="Instagram access token" name="instagram_access_token" hint={credentialStatus?.instagram ? '● Token saved' : 'Not set'}>
            <input id="instagram_access_token" name="instagram_access_token" type="password" autoComplete="off" className="input font-mono text-xs" placeholder={credentialStatus?.instagram ? '••••••••' : 'EAAG…'} />
          </Field>
          <Field label="Google Business location" name="google_gbp_location_id" error={fe.google_gbp_location_id}>
            <input id="google_gbp_location_id" name="google_gbp_location_id" defaultValue={business?.google_gbp_location_id ?? ''} className="input font-mono text-xs" placeholder="accounts/123/locations/456" />
          </Field>
          <Field label="Google Business token" name="google_gbp_token" hint={credentialStatus?.google ? '● Token saved' : 'Not set'}>
            <input id="google_gbp_token" name="google_gbp_token" type="password" autoComplete="off" className="input font-mono text-xs" placeholder={credentialStatus?.google ? '••••••••' : 'ya29…'} />
          </Field>
        </div>
      </Section>

      {/* Sticky save bar — always reachable on mobile */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-ink-200 bg-ink-50/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {state && (
          <p role="status" className={`mr-auto text-sm ${state.ok ? 'text-green-700' : 'text-red-600'}`}>
            {state.ok ? state.message : state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Saving…' : business ? 'Save settings' : 'Create client'}
        </button>
      </div>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 mb-5 text-sm text-ink-500">{hint}</p>}
      {children}
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
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
