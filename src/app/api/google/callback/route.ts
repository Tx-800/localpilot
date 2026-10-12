import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ACTIVE_BUSINESS_COOKIE } from '@/lib/session';
import { exchangeCode, readState } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

/** GET /api/google/callback — Google redirects here after consent; store the refresh token. */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const state = readState(searchParams.get('state') ?? '');
  const backPath = state?.kind === 'agency' ? '/dashboard/profile' : '/dashboard/settings';
  const back = (status: string) => NextResponse.redirect(`${origin}${backPath}?google=${status}`);

  if (searchParams.get('error')) return back('cancelled'); // user pressed Cancel on Google's screen

  const code = searchParams.get('code');
  if (!state || !code) return back('error');

  // The same signed-in user who started the flow must finish it.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) return back('error');

  let businessId: string | null = null;
  if (state.kind === 'business') {
    const { data: business } = await supabase.from('business_profiles').select('id').eq('id', state.businessId).maybeSingle();
    if (!business) return back('error');
    businessId = business.id;
  }

  try {
    const { refreshToken, email } = await exchangeCode(code, `${origin}/api/google/callback`);
    const admin = createAdminClient();
    const { error } =
      state.kind === 'agency'
        ? await admin
            .from('agency_credentials')
            .upsert({ user_id: user.id, google_refresh_token: refreshToken, google_email: email }, { onConflict: 'user_id' })
        : await admin
            .from('business_credentials')
            .upsert({ business_id: businessId, google_refresh_token: refreshToken }, { onConflict: 'business_id' });
    if (error) return back('error');
  } catch {
    return back('error');
  }

  const res = back('connected');
  if (businessId) {
    res.cookies.set(ACTIVE_BUSINESS_COOKIE, businessId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}
