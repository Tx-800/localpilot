'use client';

import { useActionState } from 'react';
import { changePassword, updateProfile } from '@/actions/auth';

export function ProfileForm({
  email,
  fullName,
  agencyName,
}: {
  email: string;
  fullName: string;
  agencyName: string;
}) {
  const [profileState, profileAction, savingProfile] = useActionState(updateProfile, null);
  const [passwordState, passwordAction, savingPassword] = useActionState(changePassword, null);

  return (
    <div className="space-y-8 lg:space-y-10">
      <Section title="Your details" hint="Shown in the app and used to identify your account.">
        <form action={profileAction}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="email">Email</label>
              <input id="email" value={email} readOnly disabled className="input" />
              <p className="hint">Your sign-in email can’t be changed here.</p>
            </div>
            <div>
              <label className="label" htmlFor="full_name">Your name</label>
              <input id="full_name" name="full_name" required maxLength={120} defaultValue={fullName} className="input" autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="agency_name">Agency / business name</label>
              <input id="agency_name" name="agency_name" required maxLength={120} defaultValue={agencyName} className="input" autoComplete="organization" placeholder="e.g. Powai Digital Studio" />
            </div>
          </div>
          <Footer state={profileState}>
            <button type="submit" disabled={savingProfile} className="btn-primary">
              {savingProfile ? 'Saving…' : 'Save details'}
            </button>
          </Footer>
        </form>
      </Section>

      <Section title="Password" hint="Use at least 8 characters. You stay signed in after changing it.">
        <form action={passwordAction}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="password">New password</label>
              <input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
            </div>
            <div>
              <label className="label" htmlFor="confirm_password">Confirm new password</label>
              <input id="confirm_password" name="confirm_password" type="password" required minLength={8} className="input" autoComplete="new-password" />
            </div>
          </div>
          <Footer state={passwordState}>
            <button type="submit" disabled={savingPassword} className="btn-secondary">
              {savingPassword ? 'Updating…' : 'Change password'}
            </button>
          </Footer>
        </form>
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[17rem_1fr] lg:gap-10">
      <div className="lg:pt-5">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-500">{hint}</p>
      </div>
      <div className="card p-5 sm:p-6">{children}</div>
    </section>
  );
}

function Footer({ state, children }: { state: { error?: string; message?: string } | null; children: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-end gap-3 border-t border-ink-100 pt-5">
      {state && (
        <p role="status" className={`mr-auto text-sm font-medium ${state.error ? 'text-red-600' : 'text-emerald-700'}`}>
          {state.error ?? state.message}
        </p>
      )}
      {children}
    </div>
  );
}
