'use client';

import { useActionState, useState } from 'react';
import { signIn, signUp } from '@/actions/auth';

export function LoginForm({ next, allowSignup }: { next: string; allowSignup: boolean }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [signInState, signInAction, signingIn] = useActionState(signIn, null);
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, null);

  const state = mode === 'signin' ? signInState : signUpState;
  const pending = signingIn || signingUp;

  return (
    <div className="card p-6">
      {allowSignup && (
        <div className="mb-5 grid grid-cols-2 rounded-lg bg-ink-100 p-1 text-sm">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md py-1.5 font-medium transition ${
                mode === m ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
      )}

      <form action={mode === 'signin' ? signInAction : signUpAction} className="space-y-4">
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

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.message && <p className="text-sm text-green-700">{state.message}</p>}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
