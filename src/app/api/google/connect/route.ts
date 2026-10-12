import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { authorizeUrl, createState } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/google/connect?target=agency        — connect the agency's Google account (My Profile)
 * GET /api/google/connect?businessId=…          — connect one client's own Google account
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const businessId = searchParams.get('businessId');
  const agency = searchParams.get('target') === 'agency';
  const backPath = agency ? '/dashboard/profile' : '/dashboard/settings';
  const back = (status: string) => NextResponse.redirect(`${origin}${backPath}?google=${status}`);

  if (!env.googleOAuthEnabled()) return back('not_configured');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const redirectUri = `${origin}/api/google/callback`;
  if (agency) return NextResponse.redirect(authorizeUrl(redirectUri, createState({ kind: 'agency', userId: user.id })));

  // RLS: only returns the business if this user owns it.
  const { data: business } = await supabase.from('business_profiles').select('id').eq('id', businessId ?? '').maybeSingle();
  if (!business) return back('error');
  return NextResponse.redirect(
    authorizeUrl(redirectUri, createState({ kind: 'business', userId: user.id, businessId: business.id })),
  );
}
