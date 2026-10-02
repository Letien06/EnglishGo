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

## Save Dau English JSON To Firestore

The application reads persisted material from `dauToeicMirror` before contacting
the upstream API. Each catalog, test Part, or level session is stored as a
Firestore document with a JSON-compatible `payload`. Large payloads use
`jsonChunks`; sessions use `chunks`. These are persistent documents, not
temporary files. The existing sync also populates the canonical test, question,
passage, answer-option, and accepted-answer collections used by the app.

From `web/`, using the configured Firebase service account and public Dau English
connection, inspect the target first:

```powershell
node --env-file=../.env --env-file=.env.local scripts/sync-dauenglish.mjs inspect
```

Recommended: download and verify a full local JSON snapshot first, without any
Firestore writes. Then publish that file to Firestore using compact documents:

```powershell
node --env-file=../.env --env-file=.env.local scripts/sync-dauenglish.mjs download <firebase-project-id>
node --env-file=../.env --env-file=.env.local scripts/sync-dauenglish.mjs publish <firebase-project-id> <materials-json-path>
```

- `download` reuses the application's public source adapters, verifies the
  declared test question counts and difficulty-level membership, and prints the
  exact local `materials.json` path. No personal Dau English session is needed.
- `publish` saves the complete immutable JSON archive first, reads it back to
  verify SHA-256, and then updates `dauToeicMirror` for the existing app readers.
  It prioritizes Part 1–7 difficulty levels/sessions and verifies every mirrored
  payload. Its separate `dauToeicSyncStatus/<version>__jsonMirror` status does not
  claim the normalized question/answer collections were refreshed.
- The publisher uses bounded REST commits, stops immediately on quota errors,
  and only writes the snapshot, mirror, and material-sync-status collections.
  It never writes user profiles, attempts, notes, or learning history. It does
  not upgrade billing. Retry `publish` with the **same file** after a quota issue
  is resolved; already published materials are checked and skipped.
- JSON text chunks are at most 700,000 UTF-8 bytes. Application session chunks
  also have byte and item-count limits; all chunks for one material are committed
  atomically. Audio and images remain URLs, not downloaded binaries.

The older normalized import below also writes individual question and answer
documents. It can require tens of thousands of writes and exhaust a free daily
quota; it is **not necessary** just to persist JSON or serve difficulty sessions.
Only use it when those additional normalized collections are required:

```powershell
node --env-file=../.env --env-file=.env.local scripts/sync-dauenglish.mjs refresh <firebase-project-id>
```

- Requires Node.js 24 and the installed workspace dependencies. Credentials can
  come from `FIREBASE_SERVICE_ACCOUNT_JSON` or the existing
  `FIREBASE_SERVICE_ACCOUNT_PATH`; credentials are never written into an export.
- `refresh` restarts only the sync checkpoint; it does not delete material or
  learner history. The runner declines to start over a recently active sync.
- `sync` resumes the persisted cursor after an interrupted run. The runner
  processes consecutive time-bounded slices instead of waiting for the next cron.
- `export` only verifies and exports a previously completed sync. Verification
  checks all expected material documents, their chunks, and level membership.
- `archive` additionally saves a fixed JSON snapshot from an already completed
  sync. `refresh` and `sync` also archive their completed result automatically.
  Snapshots live at `dauEnglishSnapshots/<version>__<timestamp>__<hash>`, with
  JSON text in `jsonChunks`. Chunks are bounded by UTF-8 byte length, not character
  count, and are read back to verify the full SHA-256 before marking the snapshot
  complete. Later mirror refreshes do not overwrite these snapshots.
- A successful run writes `materials.json` plus a SHA-256 manifest under the
  Git-ignored `web/.seed-tmp/dauenglish/snapshot-<timestamp>/` directory. The
  export is reconstructed from Firestore, not merely from the upstream response.
- If the host clock is skewed, the runner aligns its own process clock with a
  Google HTTPS response for credential signing. It does not change Windows time
  or production settings, and restores the process clock when finished.
- Audio and image URLs are preserved in JSON. The binary media files remain on
  the source host; independently preserving them requires a separate Storage job.

## Google Drive Material Storage

The alternative content backend stores Dau English TOEIC material JSON privately
in the administrator's Google Drive. Firestore continues to store accounts,
drafts, attempts, scores, notes, and learning progress. No learner collections
are migrated or deleted. Vocabulary catalogs outside the TOEIC snapshot retain
their existing source. Audio and image binaries also remain at their original
URLs; a Drive JSON backup does not independently preserve those media files.

### Connect The Storage Owner

1. In the Google Cloud project you control, enable the **Google Drive API**.
2. Configure Google Auth Platform (OAuth consent). If the app is External and
   in Testing, add the Google account owning the storage as a test user. Testing
   authorizations can expire after seven days; configure the appropriate
   production/internal publishing status before relying on unattended access.
3. Create an OAuth client of type **Desktop app** and download its JSON locally.
   Do not use the Firebase web API key, a service-account key, or an account
   password. Do not paste the OAuth JSON or refresh token into chat or Git.
4. From `web/`, run:

```powershell
node scripts/sync-dauenglish-drive.mjs connect 'C:\path\to\desktop-oauth-client.json'
```

Open the displayed Google authorization URL, choose the account owning the
Drive storage, and grant the requested `drive.file` access. The CLI uses PKCE,
a random OAuth state, and a loopback callback listening only on `127.0.0.1` for
five minutes. It does not change Firebase sign-in or request access to every
file in the user's Drive. The connected email and Drive storage usage are
printed for confirmation; credentials are not printed.

OAuth credentials stay under Git-ignored
`web/.seed-tmp/dauenglish-drive/oauth.json`. Treat this file as a secret: protect
it with your OS account permissions and do not share the whole export folder.
Connecting only grants access; it does not activate Drive on the live website.

The CLI saves the OAuth credentials before checking the Drive account. If that
check fails (for example, a 403 because Google Drive API is not enabled), enable
the API in the OAuth client's project and rerun the same `connect` command. It
reuses the saved grant instead of asking for consent again. Uploads remain
blocked until the storage owner has been verified. If the grant was revoked or
you intentionally want to choose another account, run `connect` with the
`--reauthorize` flag.

The loopback listener is temporary. If an old callback URL shows
`ERR_CONNECTION_REFUSED`, do not refresh or share that URL; run `connect` again
and use the new authorization URL if one is displayed. The callback waits for
its response to finish before closing the listener, and reports receipt of the
grant separately from the later Drive API/account verification.

### Prepare, Upload, And Verify

Use the full `materials.json` already produced by the Dau English downloader:

```powershell
node scripts/sync-dauenglish-drive.mjs prepare '<materials-json-path>'
node scripts/sync-dauenglish-drive.mjs upload '<materials-json-path>'
node scripts/sync-dauenglish-drive.mjs verify '<materials-json-path>'
```

- `prepare` validates the full catalog, per-test question counts, and difficulty
  session membership. It creates a manifest and content-addressed UTF-8 chunks
  locally without contacting Firestore or Drive.
- `upload` creates a **private** snapshot folder in the connected account's
  My Drive. It preserves the original complete `materials.json`, uploads the
  smaller per-material chunks, and publishes `manifest.json` last. No public
  sharing permissions are created.
- File IDs are reserved and checkpointed before uploads. Rerunning the same
  command resumes without creating duplicate finished files; changes to a
  previously uploaded file are rejected rather than overwritten. Files are
  read back and SHA-256 checked before the snapshot is marked complete.
- `verify` rechecks the existing snapshot without uploading anything. Both
  commands stop on API/quota errors instead of retrying indefinitely.
- Every snapshot gets a new immutable manifest ID. Keep the previous ID for
  rollback; never overwrite a manifest that a deployed website is using.

### Optional Balanced Practice Groups

To split Parts 2, 3, 4, 6, and 7 into four practice groups without claiming a
TOEIC difficulty or score band, create a separate snapshot before uploading:

```powershell
node scripts/regroup-dauenglish.mjs '<source-materials.json>' '<new-grouped-materials.json>'
node scripts/sync-dauenglish-drive.mjs upload '<new-grouped-materials.json>'
node scripts/sync-dauenglish-drive.mjs verify '<new-grouped-materials.json>'
```

The offline regrouping command validates the input and output and refuses to
overwrite an existing file. It preserves the original source timestamp, all
test materials, and Parts 1 and 5. Items are sorted by their stable IDs, then
divided into four groups whose item counts differ by at most one. A passage and
all its questions always stay together; question counts per group can differ.
Each moved item retains its original `sourceLevel`; question difficulty fields,
answers, explanations, media links, and IDs are unchanged.

Grouped catalogs and sessions carry `grouping: "balanced"`. The dashboard and
practice header display **Nhóm luyện tập 1–4**, not score bands. Learner history
continues to follow current item membership without migrating or deleting
Firestore records. Answer rewards use each item's server-loaded `sourceLevel`,
so moving a question to another group preserves its previous points. The client
catalog cache is versioned to discard the old
level-3-only layout. After a future source download, rerun the regrouping command
before publishing if these groups should be retained. Grouping is deterministic
for the same set of IDs, but adding or removing items can change membership.

Activate the new manifest only after verification, and retain the original
manifest for rollback. The regrouping command does not publish anything itself.

### Activate On Vercel

Only after a successful upload, the CLI writes a secret
`.env.drive.production` inside that snapshot's Git-ignored local directory.
Copy its five values into the matching Vercel project/environment:

```dotenv
DAUTOEIC_CONTENT_STORAGE=google-drive
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REFRESH_TOKEN=...
GOOGLE_DRIVE_MANIFEST_ID=...
```

Keep all five server-side; none may use a `NEXT_PUBLIC_` prefix. Keep the existing
Firebase credentials because learner state still lives in Firestore. Redeploy
the application after changing environment variables. For local development,
use the same values in `web/.env.local` and restart Next.js.

Drive mode reads the requested JSON chunks on the server, verifies checksums,
and caches chunks for 24 hours and the immutable manifest for one hour using
the Next.js data cache. Each chunk stays below 700,000 UTF-8 bytes, so the entire
32 MB source snapshot is never downloaded for a single lesson. Cache keys
include the provider/manifest to avoid serving the previous Firestore catalog
after a backend switch. Drive API calls and OAuth tokens are never exposed to
the browser.

In Drive mode, material reads, test catalog pagination, normalized question
imports, the legacy Firestore cron, and practice content/answer-key caches no
longer write material to Firestore. User progress writes still use Firestore,
so existing quota exhaustion can still block saving an attempt until quota is
available again. A Drive failure returns a controlled error rather than quietly
switching to stale Firestore data or a missing upstream source.

Verify Part 1–7 levels, one listening session, one reading session, the test
catalog, and one practice exam after deployment. Do not switch production before
the upload's read-back verification succeeds. To roll back, restore
`DAUTOEIC_CONTENT_STORAGE=firestore` (or the previous Drive manifest ID) and
redeploy. This does not delete either backend or any learner history.

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
