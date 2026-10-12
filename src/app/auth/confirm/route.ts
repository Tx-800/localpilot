import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Email link landing for the token_hash flow (Supabase email template:
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email).
 * Unlike the PKCE code flow, this works when the link is opened in a different
 * browser or device than the one used to sign up (e.g. the Gmail app).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}/dashboard`);
    return NextResponse.redirect(`${origin}/login?notice=link_expired`);
  }
  return NextResponse.redirect(`${origin}/login?notice=link_invalid`);
}
