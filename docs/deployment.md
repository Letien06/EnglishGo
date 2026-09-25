# Deployment

EnglishWebApp deploys from the `web/` Next.js application to Vercel.

## Architecture

- Runtime: Next.js App Router, TypeScript, Tailwind.
- Hosting: Vercel, project root directory `web`.
- Auth: Firebase Authentication with httpOnly session cookies.
- Database: Cloud Firestore through Firebase Admin SDK.
- Media: Firebase Storage. Uploaded media is served from Firebase Storage URLs, not from the app filesystem.
- AI: Gemini API for vocabulary generation and writing-related flows.
- External TOEIC source: DauToeic Supabase REST API for practice/listening/reading content.

## Required Vercel Variables

Set these variables in the Vercel project for Production and Preview as appropriate:

```text
FIREBASE_SERVICE_ACCOUNT_JSON=<one-line-service-account-json>
FIREBASE_PROJECT_ID=englishwebapp-67ab4
FIREBASE_STORAGE_BUCKET=<bucket-name-if-not-default>

NEXT_PUBLIC_FIREBASE_WEB_API_KEY=<firebase-web-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<firebase-auth-domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=englishwebapp-67ab4
NEXT_PUBLIC_FIREBASE_APP_ID=<firebase-web-app-id>

GEMINI_API_KEY=<gemini-api-key>
GEMINI_MODEL=gemini-2.5-flash
ADMIN_EMAILS=<comma-separated-admin-emails>

DAUTOEIC_SUPABASE_URL=https://odlnhfaygiotcyehuysw.supabase.co
DAUTOEIC_ANON_KEY=<dauenglish-public-publishable-key>
DAUTOEIC_MEDIA_BASE_URL=https://odlnhfaygiotcyehuysw.supabase.co/storage/v1/object/public/mock-test-media
MEDIA_BASE_URL=<optional-firebase-storage-base-url>

UPSTASH_REDIS_REST_URL=<https://...upstash.io>
UPSTASH_REDIS_REST_TOKEN=<upstash-rest-token>
RATE_LIMIT_FAIL_CLOSED=true
CONCURRENCY_LIMIT_FAIL_CLOSED=true
FIREBASE_MAX_CONCURRENCY=160
GEMINI_MAX_CONCURRENCY=12
GEMINI_TIMEOUT_MS=20000
```

`FIREBASE_STORAGE_BUCKET` is optional only when the default bucket name is correct for the Firebase project. If uploads fail with a bucket error, set it explicitly from Firebase Console.

## Dau English Migration (September 26, 2026)

The upstream website is now `https://dauenglish.com/`, backed by Supabase project
`odlnhfaygiotcyehuysw`. Changing the website domain alone does not update the API.
Keep the `DAUTOEIC_*` variable names for compatibility, but update all three values
above in each Vercel environment and redeploy. Existing Vercel values override
the defaults in source code; the old project URL/key must not be retained.

Use the public `sb_publishable_...` key published by Dau English's frontend for
`DAUTOEIC_ANON_KEY`, not a service-role key or a learner's login token. Publishable
keys are sent in `apikey` only; legacy JWT anon keys also use `Authorization`.
These values stay server-side. The local configuration is `web/.env.local` and
is not deployed or committed.

The migration versions the Next.js caches, Firestore mirrors, test index and
practice snapshots. Old content is not deleted, and learner progress/attempt
IDs are unchanged. Canonical content is refreshed lazily; the weekly sync starts
a new source-specific cycle. The test index keeps the `dauToeicTestIndex`
collection ID under a versioned parent, so existing composite indexes apply.

The upstream stats RPC includes questions from tests that are no longer publicly
readable. Difficulty counts and session selection intersect those stats with
readable content before applying a session limit. Only publicly accessible
material is loaded; the adapter does not bypass login or paid-content rules.

Run the opt-in read-only upstream smoke tests from `web/` after configuring
`web/.env.local` (they skip during ordinary unit tests):

```powershell
$env:DAUENGLISH_LIVE_SMOKE = "1"
node --env-file=.env.local node_modules/vitest/vitest.mjs run src/lib/services/dautoeic.live.test.ts
Remove-Item Env:DAUENGLISH_LIVE_SMOKE
```

These tests load one practice item per Part, a sample mock-test Part and a sample
vocabulary part, plus media HEAD requests. Firestore and Next.js caching are
mocked, so the check neither changes learner data nor downloads the full library.

## Local Development

Run all commands from `web/`:

```powershell
cd D:\EnglishWebApp\web
npm install
npm run dev
```

Create `web/.env.local` from `web/.env.example` and fill the same Firebase/Gemini/DauToeic values used in Vercel.

## Verification

Before deploying:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run test:e2e
npm run build
```

Health check:

```text
https://englishwebapp.vercel.app/api/health
```

Expected response:

```json
{"success":true,"data":{"status":"up"},"error":null}
```

## Dau English Access And Progress

- The current difficulty catalog uses four score bands: below 200, 200–300,
  300–400, and 400–495. Read the paginated `get_practice_stats_page` RPC and
  intersect its IDs with readable question/passage rows; metadata alone does
  not guarantee access to full content.
- A learner signing in to Dau English in a browser does not authenticate Vercel's
  requests. Keep personal access/refresh tokens out of Git, client code, and the
  shared server configuration. Additional restricted content requires a
  provider-authorized integration, not changing the public publishable key.
- Level metadata includes the current readable `itemIds`. Dashboard progress,
  saved answers, and level resets use these IDs rather than historical level
  numbers. Retired history is preserved, not included in current totals.
- `dauenglish-v2` invalidates old server and browser level caches without
  deleting learner history. The migration does not grant additional source access.
- Live smoke tests check all four levels for every Part, including valid empty
  levels, and load a full sample question for each nonempty level.

## Firebase Rules And Indexes

Deploy Firestore rules and indexes from the repo root:

```powershell
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
```

Relevant files:

- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`

## Vercel Settings

- Root Directory: `web`
- Framework Preset: Next.js
- Region: `sin1` in `web/vercel.json`
- Serverless function limits are declared in `web/vercel.json`; Gemini and upload endpoints are allowed longer timeouts.
- Vercel Analytics and Speed Insights are loaded from `web/src/app/layout.tsx`.
- Redis protection uses the Upstash REST endpoint so the same rate limit and
  dependency semaphore are shared by every Vercel instance. `*_FAIL_CLOSED`
  should only be enabled after validating the Upstash credentials in Preview.

After production deploy, inspect Vercel:

- Function logs for failed Firebase/Gemini/DauToeic calls.
- Analytics and Speed Insights for slow routes.
- Build output for function size warnings.

## Go-Live Checklist

1. Deploy production from `web/`.
2. Verify `/api/health`, `/login`, `/hub`, `/vocab`, `/listen`, `/read`, `/practice`, `/community`, `/ai/writing`, `/account`, and `/admin` with appropriate user roles.
3. Add the custom domain in Vercel and update DNS records at the DNS provider.
4. Keep `englishwebapp.vercel.app` as a fallback while DNS propagates.
5. Monitor Vercel logs, Firebase usage, Firestore indexes, and Storage upload/read behavior for several days.
6. Monitor production metrics and error logs after release.

## Rollback

If a critical issue appears, use Vercel's instant rollback to a known-good deployment.
