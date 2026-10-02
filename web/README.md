# EnglishGo Next.js App

Next.js App Router application for EnglishGo, targeting deployment on Vercel.
Firebase Authentication, Cloud Firestore, Firebase Storage, Gemini, and DauToeic
content APIs provide the application services.

## Structure

```text
web/
  src/
    app/            App Router pages and API route handlers
    components/     Shared React components
    lib/            API helpers, services, auth, and env access
    types/          Shared TypeScript/domain types
  .env.example      Required environment variables
  vercel.json       Vercel project config
```

## Getting Started

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

## Production

The Vercel project root directory should be `web`.

### Learning content and startup performance

Run `npm run build` (not only `next build`) for deployment. In Google Drive
storage mode its `prebuild` step downloads the configured immutable manifest
and verifies every JSON payload before writing a server-only `.content` bundle.
The existing `GOOGLE_DRIVE_*` variables must be available during the build.
Nothing in `.content` is committed or served as a public static asset; Next.js
file tracing includes it in the server deployment. Media URLs still point to
the source and are not downloaded by this step.

At runtime, material reads use the verified bundle and a bounded process cache.
Local development or deployments without a bundle fall back to the cached Drive
reader. To publish new content, set `GOOGLE_DRIVE_MANIFEST_ID` to the new immutable
snapshot and redeploy; do not modify an existing manifest in place. A failed
checksum/download fails the build instead of publishing incomplete lessons.

Listening and reading load material alongside verified identity, without a
Firestore profile read. Private answer history loads after the lesson renders;
late responses never replace new answers or interrupt an active learner.
Answer saving retains the existing authenticated POST checks and scoring rules.

### Practice by exam test

Listening Parts 1-4 and reading Parts 5-7 now show exam tests grouped by book,
using the same test-part material as the full-exam practice area. A practice URL
uses `testId` and `part`; it never combines questions from different tests.
Multi-question passages stay together, including all reading texts and media.
Catalog metadata is cached by content snapshot, while private progress loads
in the background and is counted by question ID, independent of the old level.

Existing `level` URLs still work. Old answers, notes, and favorites retain their
question/item IDs, and source scoring levels are preserved. Resetting a test
clears only that Part's question progress, not other tests or Parts. The bundled
snapshot already contains the full tests; no new Drive upload or environment
variable is required for this change.
