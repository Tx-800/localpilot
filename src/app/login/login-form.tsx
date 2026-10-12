'use client';

import { useActionState, useState, useTransition } from 'react';
import { resendConfirmation, signIn, signUp, type AuthState } from '@/actions/auth';

export function LoginForm({ next, allowSignup }: { next: string; allowSignup: boolean }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [signInState, signInAction, signingIn] = useActionState(signIn, null);
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, null);
  const [resendState, setResendState] = useState<AuthState>(null);
  const [resending, startResend] = useTransition();

  const base = mode === 'signin' ? signInState : signUpState;
  const state = mode === 'signin' && resendState ? resendState : base;
  const pending = signingIn || signingUp;
  const unconfirmed = mode === 'signin' ? (resendState ?? signInState)?.unconfirmedEmail : undefined;

  const resend = () =>
    unconfirmed && startResend(async () => setResendState(await resendConfirmation(unconfirmed)));

  return (
    <div>
      {allowSignup && (
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-ink-100 p-1 text-sm">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setResendState(null);
              }}
              className={`rounded-lg py-2 font-semibold transition ${
                mode === m ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
      )}

      <form action={mode === 'signin' ? signInAction : signUpAction} onSubmit={() => setResendState(null)} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        {mode === 'signup' && (
          <>
            <div>
              <label className="label" htmlFor="full_name">Your name</label>
              <input id="full_name" name="full_name" required maxLength={120} className="input" autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="agency_name">Agency / business name</label>
              <input id="agency_name" name="agency_name" required maxLength={120} className="input" autoComplete="organization" placeholder="e.g. Powai Digital Studio" />
            </div>
          </>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="input"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </div>

        {state?.error && (
          <div role="alert" className="rounded-xl border border-red-200/70 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {state.error}
            {unconfirmed && (
              <button type="button" onClick={resend} disabled={resending} className="mt-1.5 block font-semibold underline underline-offset-2 disabled:opacity-60">
                {resending ? 'Sending…' : 'Resend confirmation email'}
              </button>
            )}
          </div>
        )}
        {state?.message && (
          <p role="status" className="rounded-xl border border-emerald-200/70 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
            {state.message}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary h-11 w-full">
          {pending ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
