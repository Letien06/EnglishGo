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

DAUTOEIC_SUPABASE_URL=https://qfhmnlvgweznzcsoijyr.supabase.co
DAUTOEIC_ANON_KEY=<dautoeic-anon-key>
DAUTOEIC_MEDIA_BASE_URL=https://qfhmnlvgweznzcsoijyr.supabase.co/storage/v1/object/public/mock-test-media
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
