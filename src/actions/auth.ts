'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type AuthState = { error?: string; message?: string } | null;

function safeNext(next: FormDataEntryValue | null) {
  const n = String(next ?? '');
  return n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard';
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
  if (error) return { error: error.message };
  redirect(safeNext(formData.get('next')));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const origin = (await headers()).get('origin') ?? '';
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { full_name: String(formData.get('full_name') ?? '') },
    },
  });
  if (error) return { error: error.message };
  if (data.session) redirect('/dashboard'); // email confirmation disabled
  return { message: 'Check your inbox to confirm your email, then sign in.' };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
