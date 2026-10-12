import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateDraftForBusiness } from '@/lib/generation';
import { AppError, toMessage } from '@/lib/errors';
import { env } from '@/lib/env';
import type { BusinessProfile } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // image generation can be slow

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/generate-draft   (dashboard button)
 *   Auth: Supabase session cookie. Body: { businessId: string, scheduledFor?: string }
 *   RLS guarantees the user can only generate for businesses they own.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AppError('UNAUTHORIZED', 'Sign in required');

    const body = (await req.json().catch(() => ({}))) as { businessId?: string; scheduledFor?: string };
    if (!body.businessId || !UUID_RE.test(body.businessId)) {
      throw new AppError('VALIDATION', 'A valid businessId is required');
    }

    const { data: business } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('id', body.businessId)
      .maybeSingle();
    if (!business) throw new AppError('NOT_FOUND', 'Business not found');

    const draft = await generateDraftForBusiness(supabase, business as BusinessProfile, {
      scheduledFor: body.scheduledFor ?? null,
    });

    return NextResponse.json({ ok: true, draft }, { status: 201 });
  } catch (err) {
    const { error, code } = toMessage(err);
    const status = err instanceof AppError ? err.status : 500;
    return NextResponse.json({ ok: false, error, code }, { status });
  }
}

/**
 * GET /api/generate-draft   (cron)
 *   Auth: Authorization: Bearer $CRON_SECRET  (Vercel Cron sends this automatically)
 *   Query: ?businessId=<uuid>  → one business; otherwise every business with
 *          auto_generate_enabled = true gets one new draft (quota permitting).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get('authorization'))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const businessId = req.nextUrl.searchParams.get('businessId');

  let query = admin.from('business_profiles').select('*');
  if (businessId) {
    if (!UUID_RE.test(businessId)) return NextResponse.json({ ok: false, error: 'Bad businessId' }, { status: 422 });
    query = query.eq('id', businessId);
  } else {
    query = query.eq('auto_generate_enabled', true);
  }

  const { data: businesses, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Housekeeping: free slots held by publishes that crashed mid-flight.
  await admin.rpc('release_stuck_publishes');

  const results: { businessId: string; status: 'created' | 'skipped' | 'error'; detail?: string }[] = [];

  // Sequential on purpose: keeps provider rate limits and function memory predictable.
  for (const b of (businesses ?? []) as BusinessProfile[]) {
    try {
      const draft = await generateDraftForBusiness(admin, b);
      results.push({ businessId: b.id, status: 'created', detail: draft.id });
    } catch (err) {
      const { error: msg, code } = toMessage(err);
      results.push({ businessId: b.id, status: code === 'QUOTA_EXCEEDED' ? 'skipped' : 'error', detail: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    created: results.filter((r) => r.status === 'created').length,
    results,
  });
}

function isAuthorizedCron(header: string | null): boolean {
  const secret = env.cronSecret();
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
