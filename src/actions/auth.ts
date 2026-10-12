'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export type AuthState = { error?: string; message?: string; unconfirmedEmail?: string } | null;

function safeNext(next: FormDataEntryValue | null) {
  const n = String(next ?? '');
  return n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard';
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = String(formData.get('email') ?? '').trim();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: String(formData.get('password') ?? ''),
  });
  if (error) {
    if (error.code === 'email_not_confirmed') {
      return { error: 'Please confirm your email first — check your inbox (and spam).', unconfirmedEmail: email };
    }
    if (error.code === 'invalid_credentials') return { error: 'Wrong email or password.' };
    return { error: error.message };
  }
  redirect(safeNext(formData.get('next')));
}

/** Send the sign-up confirmation email again. */
export async function resendConfirmation(email: string): Promise<AuthState> {
  if (!email) return { error: 'Enter your email first.' };
  const supabase = await createClient();
  const origin = (await headers()).get('origin') ?? '';
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message, unconfirmedEmail: email };
  return { message: `Confirmation email sent to ${email}. Open the link, then sign in.` };
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!env.allowSignup()) return { error: 'New sign-ups are closed. Ask your administrator for an account.' };

  const str = (k: string) => String(formData.get(k) ?? '').trim();
  const fullName = str('full_name');
  const agencyName = str('agency_name');
  const email = str('email');
  const password = String(formData.get('password') ?? '');

  if (!fullName || fullName.length > 120) return { error: 'Enter your name (up to 120 characters).' };
  if (!agencyName || agencyName.length > 120) return { error: 'Enter your agency or business name (up to 120 characters).' };
  if (!email) return { error: 'Enter your email.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };

  const supabase = await createClient();
  const origin = (await headers()).get('origin') ?? '';
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { full_name: fullName, agency_name: agencyName },
    },
  });
  if (error) return { error: error.message };
  if (data.session) redirect('/dashboard'); // email confirmation disabled
  return { message: `We sent a confirmation link to ${email}. Open it on any device, then sign in here.` };
}

export type ProfileState = { error?: string; message?: string } | null;

/** [My Profile] — update name + agency name on the signed-in user's profile row. */
export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in required' };

  const fullName = String(formData.get('full_name') ?? '').trim();
  const agencyName = String(formData.get('agency_name') ?? '').trim();
  if (!fullName || fullName.length > 120) return { error: 'Enter your name (up to 120 characters).' };
  if (!agencyName || agencyName.length > 120) return { error: 'Enter your agency or business name (up to 120 characters).' };

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, agency_name: agencyName })
    .eq('id', user.id);
  if (error) return { error: error.message };

  revalidatePath('/dashboard', 'layout');
  return { message: 'Profile saved' };
}

/** [My Profile] — change the signed-in user's password. */
export async function changePassword(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm_password') ?? '');
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  if (password !== confirm) return { error: 'The two passwords do not match.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { message: 'Password changed' };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
