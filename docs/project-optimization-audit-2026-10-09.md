# EnglishGo project optimization audit - 2026-10-09

## Scope and limits

Repository-wide static searches covered 545 TypeScript/TSX files, 43 page entries,
89 API route entries, Firestore service queries, browser persistence, realtime,
media, service-worker caching, and production build traces. Critical learning
paths were then inspected directly. This is not a claim that every UI state or
every API was exercised in a browser.

The worktree already contained an optimization batch when this audit resumed.
This report distinguishes confirmed remaining issues from work already present.
No production deployment, live Firestore document counts, Vercel runtime logs,
or authenticated browser performance measurements were obtained in this pass.

## Verification

- Full Vitest run: 152 files passed, 1 skipped; 1,010 tests passed, 10 skipped.
- TypeScript and ESLint: passed.
- Production build: passed, including generation of 77 static outputs.
- Service worker: `node --check public/sw.js` passed.
- Material trace verification: all seven compact Part indexes present in the
  listening/reading page and API traces; no raw SHA-named JSON duplicates.
- Build warning: `dautoeic-drive.ts` dynamic filesystem pattern matches 13,064
  local files. This is a build/dependency-tracing measurement, not browser downloads.

Local build uses the runtime content provider: the prebuild environment did not
enable the Drive provider. The trace check references an existing local bundle;
it does not prove the current Vercel deployment uses that same bundle or config.

## Measurements

| Item | Local result | Meaning |
| --- | --- | --- |
| Landing page trace | 216 dependencies; 0 material files | Root page does not package the study library in this build. |
| Reading/listening/vocabulary page traces | 1,236 material files, 82,906,104 bytes each | Broad fallback includes multiple local bundles when a manifest is not configured. Vercel may deduplicate shared files; these are not additive browser bytes. |
| Vocabulary snapshot in the recent local Pro bundle | 16,665,529 bytes uncompressed | A cold vocabulary index reads, parses, validates, and indexes all vocabulary even to show catalog metadata. |
| Grammar materials in that bundle | 16 entries, 7,031,577 bytes uncompressed | Includes catalog and topic materials; the library loads topics for answer keys. |
| Largest Firebase-containing client chunk | 666,196 bytes raw, about 195 KB gzip | Need route/network analysis to determine actual startup cost. Two generated filenames do not prove both download on one route. |

## Prioritized remaining work

### 1. P1 - Isolate exam and vocabulary browser drafts by account

Evidence:
- `web/src/app/(app)/practice/session/[testId]/PracticeSessionClient.tsx:69`
- `web/src/app/(app)/practice/PracticeTestLauncher.tsx:99`
- `web/src/app/(app)/vocab/[setId]/flashcards/FlashcardGame.tsx:1182`

Both draft keys omit UID. On a shared browser, another account can resume the
previous account's local answers. Scope all read/write/reset/delete paths by
UID and session/run ID. Do not automatically assign an ownerless legacy draft
to the next signed-in user. Select the newest valid local/server draft and catch
storage-unavailable errors. Verify account switch, reset, and shared-device cases.

### 2. P1 - Make exam saves ordered and retryable

Evidence: `PracticeSessionClient.tsx:226`, `:240`, `:355`, `:368` under the path above.

The online handler displays "Synced" whenever the save promise resolves, even
when the returned `ok` is false. Manual, debounced, visibility, and online saves
can overlap. Server `saveDraft` performs a read followed by an unconditional set
and has no client revision comparison (`web/src/lib/services/practice.ts:319`).
An older request can overwrite a newer draft.

Use one UID-scoped persistent queue with monotonically ordered revisions,
serialized writes, server-side stale-write rejection, bounded backoff, and an
explicit retry action. Queue replay must check the currently authenticated UID.
Submission/reset must settle or invalidate old queued writes. Test delayed
responses, offline reload, 503, account changes, and post-submission replay.

### 3. P1 - Split vocabulary metadata from the full word corpus

Evidence: `web/src/lib/services/dautoeic-vocab.ts:86`, `:96`, `:339`.

All catalog and set lookups initialize `vocabulary__all`. The memory cache helps
warm processes but not a new serverless instance. Generate a small catalog index
and per-set/per-Part word shards at content preparation time. Keep membership,
checksum, and access-scope validation. Measure cold CPU, response time, memory,
and requested bytes separately; do not report snapshot size as a client payload.

### 4. P1 - Generate compact grammar answer-key indexes

Evidence:
- `web/src/app/(app)/read/grammar/page.tsx:7`
- `web/src/lib/services/dautoeic-grammar.ts:36`

The grammar catalog waits for all topic bodies to compute device progress.
Concurrency is bounded to three, but the total work still scales with all
questions. Prepare an answer-key projection during import/build, keyed to the
snapshot hash. The library reads metadata plus that projection; only opening a
topic reads its question bodies. Preserve honest unknown progress on failures.

### 5. P1 - Bound reads for vocabulary review sessions

Evidence: `web/src/lib/services/vocab.ts:964` and `:221`.

`getReviewSession` reads all learner progress, filters due items, sorts them, then
takes the requested size. Query due status/time with a stable order and a bounded
batch. Refill if referenced content has been removed so the session is not
silently short. Backfill required fields/indexes before relying on `orderBy`.
Target read growth proportional to the requested session, not lifetime history.

### 6. P2 - Paginate dictation and smaller full-scan features

Evidence:
- `web/src/lib/services/dictation.ts:76`, `:173`
- `web/src/lib/services/community.ts:78`
- `web/src/lib/services/admin.ts:53`

Dictation downloads the whole published catalog and all learner summaries;
community leaderboard sorts all rows before taking 20; moderation filters all
audit rows before taking 50. Apply database filtering/order/limits plus cursor
pagination where the UI needs the complete collection. Load dictation progress
for displayed lessons and obtain "continue" independently. Do not simply add a
limit while leaving client-only search/filter controls claiming global results.

### 7. P2 - Narrow material packaging by active snapshot and route dependency

Evidence: `web/next.config.ts:34` and `web/src/lib/services/dautoeic-drive.ts:20`.

The fallback glob can collect all local snapshots. Study routes also explicitly
include every compressed material. Enforce a validated active manifest in the
deployment environment and generate dependency lists for route families. Keep
the compressed catalog/metadata actually used by each route; removing all
archives from catalog pages would cause slow runtime Drive fallbacks.
Verify final `.nft.json` and the deployed function package, not just source globs.

### 8. P2 - Cache validated Part index projections

Evidence: `web/src/lib/services/dautoeic-drive.ts:16`, `:53`, `:57`.

The catalog cache had an 8 MB budget but a one-entry limit while keys vary by
Part. This pass raised the entry limit to seven within the same byte budget.
The text is still reparsed each call; a further improvement is caching validated
immutable projections by snapshot and Part. Measure underlying reads/parses
under alternating Parts; outer server
caching may already avoid some calls, so this is smaller than items 3 and 4.

### 9. P2 - Make the exam countdown resilient to background-tab throttling

Evidence: `PracticeSessionClient.tsx:329` under the exam session path above.

The timer decrements state once per interval. Browsers can delay timers while
hidden or suspended, causing the displayed countdown to diverge from the server
deadline. Calculate remaining time from an absolute, server-aligned deadline
and resync on visibility changes. Verify sleep/wake, hidden tabs, expiry, and
manual submission racing with timeout.

### 10. P2 - Reduce dictation rendering and media work

Evidence: `web/src/app/(app)/listen/dictation/DictationLibraryClient.tsx:35`, `:67`, `:77`.

The continue card performs repeated `lessons.find` calls, all cards render at
once, and thumbnail CSS backgrounds lack native lazy loading. Build a lesson
Map, render bounded pages, use lazy images with fixed dimensions, and retain
stable placeholder sizes. Keep the existing image billing decision explicit;
globally enabling Vercel image optimization is not automatically the best fix.

### 11. P2 - Measure route bundles and realtime before further splitting

Evidence: `web/src/lib/game-room-subscription.ts:78` and
`web/src/app/(app)/vocab/[setId]/flashcards/components/useVocabRace.ts:90`.

The application already batches race events, uses two realtime listeners, falls
back to polling only when needed, and stops subscriptions in hidden tabs.
Client-side throttling of callbacks alone does not reduce billed Firestore reads.
If load warrants it, publish a compact server scoreboard at a measured cadence
and retain authoritative scoring. Check Firebase chunk downloads per route and
defer optional game/auth modules only where they block startup. Do not add a
network step between pressing Start and starting a solo game.

### 12. P2 - Finish observable performance budgets and regression coverage

Evidence: `web/src/app/layout.tsx:79`, `web/src/lib/client-request.ts:3`,
`web/src/lib/api/handler.ts:21`.

Speed Insights already exists for Web Vitals. Custom timings cover a small set
of vocabulary flows; first usable question, audio readiness, content cache hits,
read counts, and endpoint stage timings remain unmeasured. The new request ID
header should also be included in server error logs for correlation.

Use anonymized route/flow metrics, cold/warm runs, mobile throttling, and P75
budgets. Suggested targets: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, immediate
answer feedback. These are targets, not measured claims. Add integration tests
for exam persistence and service-worker update/offline behavior, which unit
test success alone cannot establish.

## Small corrections made while finishing this audit

- Kept solo Vocabulary Rain statically available within its route bundle,
  preserving immediate controls after Start. Multiplayer remains dynamically loaded.
- Updated grammar UI tests to use the current percentage semantics and current
  storage-unavailable message. Six previously failing tests now pass.
- Replaced per-set scans in `findProgressSetCards` with one Map grouping pass:
  O(S * P) grouping becomes O(S + P), excluding the unchanged O(S log S) final
  sort. This reduces CPU work, not Firestore reads.
- Normalized line endings in the already-modified AppShell file.
- Increased the catalog index memory cache from one to seven entries, keeping
  the existing 8 MB memory ceiling.

## Implementation update (this pass)

- Exam drafts now use UID/run-scoped durable mutations, ordered revisions,
  request-ID replay protection, bounded retry/backoff, and visible retry state.
- Grammar uses build-time answer and dictionary projections; topic bodies are
  no longer scanned to render the grammar library or dictionary lookup.
- Dictation uses a sharded public catalog, 24-item pages, bounded recent
  progress, and atomic publish/archive projection updates. Search remains
  global over the compact catalog.
- PK uses one room listener and a compact scoreboard projection instead of a
  room listener plus a players collection listener. Server scoring remains
  authoritative.
- API responses expose request IDs, Firestore duration/read/byte telemetry;
  the client reports TTFB, LCP, CLS, FID/INP, first-question and audio-ready.
- Production build passed after these changes; full Vitest currently has one
  expected assertion update for the new scoreboard room write, with the race
  tests and targeted persistence tests passing. The local fallback build still
  reports a broad dynamic filesystem trace; when Drive is configured, full
  archives are excluded from route traces and only compact projections remain.
