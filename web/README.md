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
and verifies every JSON payload before writing a server-only gzip `.content` bundle.
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

Vocabulary has a separate `dauenglish-v2__vocabulary__all` entry in the same
immutable Drive snapshot. It contains the available vocabulary catalog, Parts,
and complete word JSON. Deploy a snapshot containing this entry before using
the Drive vocabulary reader. The build bundles it alongside the exam material.
Opening a Part now follows a direct link; it does not import words into
Firestore or call the source API. Vocabulary IDs are unchanged, so existing
mastery, SM-2 reviews, history, and saved games remain linked to the same words.
Catalogs and Part counts render before personalized progress, which loads
separately and is never stored in a cross-user/shared cache.
Game history and alternative set options load after the flashcard menu, without
blocking the word session or replacing game answers when responses arrive late.

To add or refresh vocabulary without changing existing exam material:

```bash
node --env-file=.env.local scripts/sync-dauenglish-vocab.mjs <existing-materials.json> <new-materials.json>
node scripts/sync-dauenglish-drive.mjs upload <new-materials.json>
```

The public exporter validates catalog counts and membership, excludes Pro tests, and
does not write to Firestore. After read-back verification, update the production
`GOOGLE_DRIVE_MANIFEST_ID` and redeploy. Audio/image URLs remain source URLs;
the JSON backup is not a backup of the media files themselves.

For provider-authorized Pro imports, use the authenticated workflow in
[`docs/deployment.md`](../docs/deployment.md#importing-provider-authorized-pro-material).
It preserves archived vocabulary and practice IDs and adds optional libraries
at `/listen/audio-dictation` and `/read/grammar`. These two libraries keep progress
on the current device, scoped by the EnglishGo learner identity.

### Vocabulary workspace

Vocabulary sessions have three client-side tabs: word browsing, contextual
learning, and games. Browsing includes search, reversible cards, session-only
stars, pronunciation, and available phrases/examples from the existing Drive
snapshot. No new sync, environment variable, or material upload is required.

Context learning walks through words, translated phrases, example sentences,
and exact English recall (up to 20 words per round). Word Blast and Vocabulary
Rain also use up to 20 words, three lives, pause-on-hidden-tab, and an optional
untimed mode. Rain reveals hints at 40%/70% of the time budget and rewards
streaks; reduced-motion users see stationary targets. These new rounds run
locally without draft/progress requests per answer. They load on demand.

Progress and history are saved only through the existing explicit save action
at the result screen. Incorrect attempts remain in review even if a later
retry succeeds; correct new-mode answers use SRS quality 4, not forced mastery.
Leaving an unfinished round asks for confirmation. Multiplayer is not included.

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
