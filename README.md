# LocalPilot — Multi-Tenant AI Local Marketing Cockpit

Next.js 15 (App Router) · Supabase (Postgres, Auth, Storage, RLS) · Tailwind CSS v4 · OpenAI / Flux (or built-in mocks)

One agency admin manages many client businesses. The system generates on-brand drafts; **nothing is ever posted without a human clicking "Approve & Post Now."** Every client has a hard monthly post cap enforced inside Postgres.

```
[Generate] ──► pending_review / draft ──► [edit caption · regenerate image] ──► [Approve & Post Now]
                     │                                                               │
                     └──► [Reject] ──► rejected               claim slot (count+1) ──┤
                                                                                     ▼
                                                              processing ──► published
                                                                   │
                                                                   └──► failed (slot refunded, retryable)
```

---

## 1. Folder structure

```
localpilot/
├── supabase/migrations/
│   ├── 0001_schema.sql            enums, profiles, business_profiles, business_credentials, content_queue
│   ├── 0002_security.sql          RLS policies + column-level grants (quota columns not client-writable)
│   ├── 0003_quota_functions.sql   create_draft · claim_publish_slot · finalize_publish · reject_draft · release_stuck_publishes
│   └── 0004_storage.sql           public `content-images` bucket
├── src/
│   ├── middleware.ts              session refresh + auth gate
│   ├── app/
│   │   ├── layout.tsx · globals.css   fonts + Tailwind v4 theme tokens and component utilities
│   │   ├── login/                     sign in / sign up
│   │   ├── auth/callback/route.ts     email confirmation
│   │   ├── api/generate-draft/route.ts  POST (button, session auth) · GET (cron, CRON_SECRET)
│   │   └── dashboard/
│   │       ├── layout.tsx             AppShell: sidebar (desktop) / top bar + drawer (mobile)
│   │       ├── page.tsx               Content Approval Hub
│   │       ├── settings/page.tsx      Client Settings panel
│   │       ├── businesses/new/        Add client
│   │       └── published/             Post history
│   ├── actions/
│   │   ├── content.ts             saveDraftChanges · regenerateImage · approveAndPostNow · rejectDraft
│   │   ├── business.ts            setActiveBusiness · saveBusinessProfile · getCredentialStatus · deleteBusiness
│   │   └── auth.ts
│   ├── components/                app-shell, business-switcher, content-card, business-settings-form,
│   │                              quota-meter, generate-draft-button, status-badge, empty-state
│   └── lib/
│       ├── supabase/              server (RLS session) · admin (service role) · middleware
│       ├── ai/                    prompts · llm (OpenAI | mock) · image (OpenAI | Flux | mock)
│       ├── publishers/            meta (Instagram Graph) · google (Business Profile) · index (fan-out)
│       ├── generation.ts          quota pre-check → copy → image → create_draft
│       ├── quota.ts · session.ts · storage.ts · errors.ts · env.ts · types.ts
└── vercel.json                    cron: Mon & Thu 07:00 UTC → GET /api/generate-draft
```

---

## 2. Launch steps

```bash
# 1. Install
npm install

# 2. Supabase project → SQL editor, run migrations in order (or `supabase db push` with the CLI)
#    0001 → 0002 → 0003 → 0004

# 3. Env
cp .env.example .env.local     # fill in Supabase URL, anon key, service role key, CRON_SECRET

# 4. Run — everything works in mock mode with no AI or Meta/Google keys
npm run dev                    # http://localhost:3000 → create account → Add client → Generate draft
```

Going live, one switch at a time:

| Env | Effect |
| --- | --- |
| `AI_TEXT_PROVIDER=openai` + `OPENAI_API_KEY` | Real captions (JSON mode) |
| `AI_IMAGE_PROVIDER=openai` or `flux` (+ `REPLICATE_API_TOKEN`) | Real images, copied into Supabase Storage |
| `PUBLISH_MODE=live` | Real Instagram / Google posts for clients with IDs + tokens saved |

**OpenAI costs** (approximate, per draft):

* Captions cost a fraction of a cent each (`gpt-5-mini` by default).
* Images cost about $0.005–0.036 each on `gpt-image-1-mini`, and about $0.009–0.133 on `gpt-image-1.5`, from low to high quality.
* `OPENAI_IMAGE_QUALITY=medium` is the recommended default. "Regenerate Image" bills another image.
* `OPENAI_REASONING_EFFORT=low` (default) keeps caption cost down: GPT-5-family models bill their hidden reasoning as output tokens, and captions need little. Models that don't accept it are retried once without it.

Supabase Auth → URL configuration: add `http://localhost:3000/auth/callback` (and your production URL) to redirect URLs.

---

### Editing drafts

Each draft card has **Instagram** and **Google** tabs:

* **Instagram** — caption body plus a separate **Hashtags** field (max 30). Hashtags are appended only when posting to Instagram.
* **Google** — its own hashtag-free text (max 1500 characters). If left empty, the Instagram caption without hashtags is used.
* **✨ Rewrite** — AI writes new text for both channels, keeping the topic and the image.
* **Upload** — use your own photo; the browser converts it to JPEG (Instagram requires JPEG) before upload. **New image** generates another AI image from the (editable) image prompt.

### Google Business: "Connect Google"

Google access tokens expire after an hour, so posting uses a stored **refresh token** instead:

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (type *Web application*).
2. Authorised redirect URI: `https://YOUR-SITE/api/google/callback` (plus `http://localhost:3000/api/google/callback` for local dev).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Vercel env vars), redeploy.
4. Client Settings → **Connect Google**, sign in with the account that manages the business, and fill in the **Google Business location** (`accounts/…/locations/…`).

The Business Profile API must be approved for your Google Cloud project. A pasted access token is still accepted as a fallback.

## 3. How quota is enforced (and why it's in SQL)

* **Draft generation** — `create_draft` locks the business row and rejects if `published + open drafts ≥ max`. The API route also does a cheap read-only pre-check first so you don't pay for an AI call that will be refused.
* **Approve & Post Now** — `claim_publish_slot` validates state (not rejected, not already processing/published, caption + image present) and **atomically increments `current_month_post_count`** under a row lock *before* any external call. Two clicks in two tabs cannot exceed the cap.
* **After the Meta/Google call** — `finalize_publish` sets `published`, or sets `failed` and **refunds** the slot. Net effect: the counter only stays incremented on a successful publish, which is what the spec asks for, without the race of incrementing afterwards.
* **Monthly reset** — lazy: the first quota call in a new UTC month zeroes the counter. No scheduler needed. The UI uses `effectiveUsage()` to show 0 before that happens.
* **Crash safety** — `release_stuck_publishes()` (run by the cron GET) moves items stuck in `processing` > 15 min to `failed` and refunds them.
* **Client can't cheat** — `current_month_post_count`, `review_status`, `published_status` have no UPDATE grant for `authenticated`; content rows can't be inserted directly. All transitions go through the SECURITY DEFINER functions above.

All of this was tested against Postgres 16 with Supabase-style roles: quota limits, refunds, retries, cross-tenant access (FORBIDDEN), anon access, month rollover and stuck-publish recovery.

---

## 4. Tailwind layout steps

Tailwind v4 — no `tailwind.config.js`. The pieces:

1. **PostCSS** — `postcss.config.mjs` loads `@tailwindcss/postcss`.
2. **Theme tokens** — `globals.css` `@theme` defines `brand-*`, `ink-*` colours and `font-sans` / `font-display` (wired to `next/font` variables in `app/layout.tsx`). Change the brand by editing those hex values.
3. **Component utilities** — `@utility btn-primary | btn-secondary | btn-ghost | input | label | card` keep JSX readable.
4. **App shell** (`components/app-shell.tsx`)
   * `lg:grid lg:grid-cols-[18rem_1fr]` → fixed sidebar + fluid main on laptops.
   * Sidebar: `hidden lg:block sticky top-0 h-dvh`.
   * Below `lg`: `sticky top-0` header holding a hamburger and the **client switcher inline**, so switching clients is one tap on mobile; nav lives in a slide-over drawer.
5. **Approval Hub grid** — `grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4` (1 → 4 columns). Cards are `flex flex-col` with `mt-auto` on the action block so buttons align across a row; images are `aspect-square`.
6. **Card actions** — `grid grid-cols-2`: Save + Regenerate side by side, Approve full width (`col-span-2`), so they stay thumb-sized on phones.
7. **Page headers** — `flex flex-col sm:flex-row sm:items-end sm:justify-between`: title, quota meter and Generate button stack on mobile and sit in one row on desktop.
8. **Settings form** — `grid sm:grid-cols-2` fields; the save bar is `sticky bottom-0` on mobile and `sm:static` on desktop.

---

## 5. Notes & next steps

* **Spec deviation (deliberate):** `google_gbp_token` lives in `business_credentials` (service-role only), not on `business_profiles`, so tokens can never be selected from a browser session. `instagram_page_id` and `google_gbp_location_id` stay on `business_profiles`. Tokens are write-only in the UI.
* For production, encrypt tokens with Supabase Vault, and replace the raw Google access token with a stored refresh token + exchange.
* Instagram requires a **public** image URL at publish time — that's why images are copied into the public bucket.
* `scheduled_for` is stored but posting is always manual ("Approve & Post Now"), per the human-in-the-loop requirement. A later "Approve & Schedule" would set `approved` and let a cron publish due items through the same claim/finalize functions.
* Generate typed DB types with `supabase gen types typescript` and pass them to the clients once the schema settles.
