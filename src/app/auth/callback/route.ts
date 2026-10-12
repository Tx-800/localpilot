import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Email-confirmation landing for Supabase's default template (PKCE code flow).
 * Supabase has already verified the email before redirecting here; the code
 * exchange only signs the user in, and it needs the cookie set at sign-up. When
 * the link is opened in another browser/app that cookie is missing, so instead
 * of reporting a failure we send the user to sign in with a "verified" notice.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const errorCode = searchParams.get('error_code') ?? searchParams.get('error');

  if (errorCode) {
    const notice = errorCode === 'otp_expired' ? 'link_expired' : 'link_invalid';
    return NextResponse.redirect(`${origin}/login?notice=${notice}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/dashboard`);
    return NextResponse.redirect(`${origin}/login?notice=verified`);
  }

  return NextResponse.redirect(`${origin}/login?notice=link_invalid`);
}
