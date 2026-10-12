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
    <div className="space-y-6">
      <form action={profileAction} className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold">Your details</h2>
        <p className="mt-0.5 mb-5 text-sm text-ink-500">Shown in the app and used to identify your account.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="email">Email</label>
            <input id="email" value={email} readOnly disabled className="input bg-ink-50 text-ink-500" />
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
        <div className="mt-5 flex items-center justify-end gap-3">
          <Status state={profileState} />
          <button type="submit" disabled={savingProfile} className="btn-primary">
            {savingProfile ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </form>

      <form action={passwordAction} className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold">Change password</h2>
        <p className="mt-0.5 mb-5 text-sm text-ink-500">At least 8 characters.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="password">New password</label>
            <input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
          </div>
          <div>
            <label className="label" htmlFor="confirm_password">Confirm new password</label>
            <input id="confirm_password" name="confirm_password" type="password" required minLength={8} className="input" autoComplete="new-password" />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <Status state={passwordState} />
          <button type="submit" disabled={savingPassword} className="btn-secondary">
            {savingPassword ? 'Updating…' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Status({ state }: { state: { error?: string; message?: string } | null }) {
  if (!state) return null;
  return (
    <p role="status" className={`mr-auto text-sm ${state.error ? 'text-red-600' : 'text-green-700'}`}>
      {state.error ?? state.message}
    </p>
  );
}
