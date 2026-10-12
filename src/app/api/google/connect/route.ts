import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { authorizeUrl, createState } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

/** GET /api/google/connect?businessId=… — start the Google consent screen for one client. */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const businessId = searchParams.get('businessId') ?? '';
  const back = (status: string) => NextResponse.redirect(`${origin}/dashboard/settings?google=${status}`);

  if (!env.googleOAuthEnabled()) return back('not_configured');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  // RLS: only returns the business if this user owns it.
  const { data: business } = await supabase.from('business_profiles').select('id').eq('id', businessId).maybeSingle();
  if (!business) return back('error');

  const state = createState({ businessId: business.id, userId: user.id });
  return NextResponse.redirect(authorizeUrl(`${origin}/api/google/callback`, state));
}
