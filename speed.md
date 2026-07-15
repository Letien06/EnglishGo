# Speed, UI/UX & Logic Audit — Production

**Audit date:** 2026-07-15 (Asia/Ho_Chi_Minh)
**Revision audited:** `886e0644`
**Verdict:** **Not ready to call the interaction layer fully smooth.** Core pages render, lint passes, and the major vocabulary save batching fix is present. However, two high-impact flows still create avoidable perceived lag: changing a vocabulary group and starting a DauToeic part. There are also race and resilience gaps around pet preferences, fetches that can wait indefinitely, and missing route error boundaries.

## Scope and method

This audit deliberately separates what was measured from what was only code-reviewed.

- Static inventory: 34 page routes, 71 API route handlers, 44 client components, 186 `<button>` occurrences, 194 `onClick` handlers, 68 client/server `fetch` calls, 40 timers, and 6 lazy client imports.
- Production HTTP: public/static paths and safe read-only APIs were requested from `https://www.englishgo.io.vn`; each headline route/API below has three samples unless marked otherwise.
- Signed-in browser: only non-destructive navigation and controls were clicked. The existing session was used only to inspect rendered state; no food was bought, no progress saved, no form submitted, and no destructive/admin action was invoked.
- Source review: loading state, error paths, request lifecycle, animation/motion, keyboard/focus handling, pet dragging, and save flows were traced through the application source.
- Quality gate: `npm run lint` passed with no output.

### Important limitations

There is no safe way to truthfully claim that every mutation button was live-tested without a disposable test account and explicit permission to create/change data. Dynamic routes also require valid lesson/test/attempt IDs. Those actions were reviewed end-to-end in source, while their read-only entry pages were rendered in production. The required verification matrix is in the plan below.

## Route coverage

| Area | Routes inspected | Coverage |
|---|---|---|
| Public/auth | `/`, `/login`, `/lessons` | Production runtime + DOM review |
| Auth redirect contract | `/account`, `/admin*`, `/ai/writing`, `/continue`, `/listen*`, `/read*`, `/practice*`, `/vocab` | Production anonymous redirect returned valid login page with preserved `from` value |
| Core learning | `/hub`, `/listen`, `/read`, `/practice`, `/continue`, `/practice/history` | Route/source reviewed; protected flows need disposable test data for submit/reset actions |
| Vocabulary | `/vocab`, `/vocab/dautoeic/[testId]`, `/vocab/[setId]`, `/vocab/[setId]/flashcards` | Production signed-in landing, ETS catalog, group switch and test-detail page rendered; save game was source-reviewed only |
| Pet and rankings | `/pet`, `/leaderboard`, `/community`, `/community/leaderboard`, `/community/contribute` | Production page and safe tab/control interactions tested; purchases, feeding, opt-in changes and contributions not submitted |
| Dynamic content/admin | dictation lesson, practice session/review, vocab set/flashcard, admin module routes | Route/API/source reviewed; cannot be exhaustively live-run without IDs, data fixture and admin permission |

All 27 concrete static route paths returned either HTTP 200 with their own page or the expected login redirect in the production HTTP sweep. Seven parameterized routes cannot be exhaustively enumerated from a URL-only sweep; one real ETS vocabulary test detail route was rendered successfully.

## Measured production results

### Page response time (HTTP)

`TTFB` is time to first response byte; `total` includes the document transfer only. It is not LCP/INP and does not include authenticated client API work.

| Route | Median TTFB / total | Transfer | Assessment |
|---|---:|---:|---|
| `/` | 0.45s / 0.47s warm; first sample 2.57s | 48.7 KB | Good warm path; cold-start tail remains visible. |
| `/login` | 0.47s / 0.47s | 12.6 KB | Good. |
| `/lessons` | 0.37s / 0.37s | 24.7 KB | Good. |
| `/pet` | 0.55s / 0.55s | 20.2 KB | Good document response. |
| `/hub` | 0.46s / 0.46s | 20.2 KB | Good document response; authenticated content still needs user-data validation. |
| `/leaderboard` | 0.91s / 1.33s median; worst 2.14s | 52.8 KB | Needs work: response tail is inconsistent. |
| `/community` | 0.63s / 1.94s median; worst 3.37s | 26.8 KB | Needs work: slowest public route measured. |
| Protected route redirect | 0.30–0.96s | 12.6 KB | Correct behavior; routes redirect to `/login?from=…`. |

### Read-only API response time (HTTP)

| API | Median total | Status | Assessment |
|---|---:|---:|---|
| `/api/health` | 0.21s | 200 | Healthy. |
| `/api/dautoeic/vocab/catalog` | 0.28s; one 0.58s tail | 200 | Healthy from anonymous production probe. |
| `/api/vocab/sets` | 0.62s; one 1.02s tail | 200 | Acceptable, but not instant for a tab shell. |
| `/api/pet/leaderboard?scope=all-time` | 1.02s; worst 1.35s | 200 | Slow enough to require a local/skeleton loading state. |
| `/api/pet` | 0.25s | 401 anonymous | Correct authorization behavior. |
| `/api/vocab/progress` | 0.40s | 401 anonymous | Correct authorization behavior. |

### Signed-in browser interaction observations

| Flow | Observed result | Assessment |
|---|---|---|
| Leaderboard: `Pet` → `Exam` tab | URL/state changed around **1.93s**; global overlay faded by about **2.20s** | Too slow for a local tab choice; it waits for a server route transition. |
| Vocabulary: change group `600 TOEIC` → `ETS 2023` | URL changed around **1.15s**, global full-screen overlay stayed active until about **3.69s** | **P0.** Catalog data was already visible, so this is avoidable blocking UI. |
| Pet: open Shop tab | Shop items rendered within the 150 ms observation window; no global overlay | Good local-tab behavior. |
| Floating pet: open control | Expanded panel exposed `Cho ăn` and `Nhà Pet` actions | Good non-destructive behavior. |
| Vocab: open ETS Test 1 detail | Seven part cards rendered successfully | Entry page works; `Vào học` was not clicked because it performs a sync/write. |

## Confirmed findings

| ID | Severity | Evidence | User impact | Correct direction |
|---|---|---|---|---|
| P0-1 | P0 | `VocabLearnTabClient` renders group links with `data-overdelay`; group selection goes back through `/vocab?group=…`. Production trace kept the global overlay active for 3.69s. | Choosing an already-loaded ETS group feels frozen and blocks visual continuity. | Make group selection client-local and update history without awaiting an RSC navigation; retain deep links and browser back support. |
| P0-2 | P0 | `DautoeicPartStudyButton` starts the generic overlay with a 7s timeout before its POST sync. Its error path only clears local `loading`; it never signals the global overlay to finish. | A failed or slow part sync can display “Đang nạp từ server…” after the button has already surfaced an error. This matches the reported stuck-loading symptom. | Remove the global overlay from this mutation. Use only a button-local pending state, explicit timeout/error/retry, and navigate only after success. |
| P0-3 | P0 | `FlashcardGame.saveAndComplete` has no request deadline. It waits sequentially for batch review, history POST, then a non-critical draft DELETE before showing completion/navigation. Only 2 AbortControllers exist in the whole source, neither protects this save flow. | A stalled connection can leave “Đang lưu…” indefinitely; even a successful save delays the success toast unnecessarily. | Define a deadline and recoverable error state for critical writes; make draft deletion non-blocking after critical success; use idempotency before any retry. |
| P0-4 | P0 | `PetDashboardClient.saveProfile` is optimistic but the two profile checkboxes remain enabled while `busy === "profile"`. Repeated clicks can issue overlapping PATCH requests; a late failed response restores an older snapshot. | Final preference can be surprising or revert, especially on a slow network. | Disable both preference controls during profile save, serialize one profile mutation, then reconcile the response once. |
| P1-1 | P1 | No `error.tsx` or `not-found.tsx` boundary exists under `src/app`. | A server component/API failure can fall to a generic framework error instead of a recoverable, branded screen with Retry/Back. | Add root and `(app)` error boundaries with correlation-safe message, retry action and navigation fallback. |
| P1-2 | P1 | `PetFloatingWidget` writes `left/top` directly on every pointer move and uses `will-change: left, top`. Pointer capture and `touch-action: none` are good, but `left/top` can force layout during a drag. | Dragging can stutter on lower-end/mobile devices; the floating pet runs on all signed-in routes. | Store drag offset in CSS transform (`translate3d`) and commit state/localStorage at most once per animation frame/end of drag; remove permanent `will-change: left, top`. |
| P1-3 | P1 | `PetFloatingWidget` calls `/api/pet` on every pathname change even when its dashboard state is already available; the pet page also loads the same dashboard on the server. | Extra authenticated request per navigation and possible visual delay for the global pet. | Cache with a short TTL/in-flight dedupe; use profile-update events as the primary invalidation path. |
| P1-4 | P1 | `VocabSetDetailClient` is a 23.2 KB/136-line compressed client component containing table, audio, import, AI, dialog and optimistic review concerns. `FlashcardGame` is 63.9 KB/1,974 lines, though learning modes are already dynamically split. | Large interactive modules are harder to maintain/test; any rerender or logic regression has a large blast radius. | Split detail dialogs/import/AI into lazy components and isolate row/status mutations; keep mode splitting in the game and move result/save orchestration into a dedicated hook. |
| P2-1 | P2 | Existing motion uses transform/opacity, `@starting-style`, focus rings and reduced-motion rules well. However the floating pet keeps several infinite decorative animations whenever visible. | Mostly polish/performance debt, not a functional blocker. | Pause decorative pet animation when the document is hidden/off-screen; preserve `prefers-reduced-motion`. |
| P2-2 | P2 | Current E2E suite has 4 checks: health, anonymous landing, protected redirect and mobile login. It does not cover pet preferences, vocabulary group selection, timeouts, save completion, or error recovery. | Regressions in the exact flows users report can return unnoticed. | Add deterministic test fixtures and E2E coverage for the P0 flows before further feature work. |

## Motion and UI review

The baseline is stronger than the reported sluggishness suggests: there is no `transition: all`, no scale-to-zero entrance, hover states are gated for fine pointers, controls have active feedback, dialogs use focus handling, and reduced-motion CSS exists. The problem is not “too much animation”; it is **blocking navigation feedback being used for local state and mutation work**.

| Before | After | Why |
|---|---|---|
| Full-screen `AppOverdelay` covers a vocabulary group choice for ~3.69s | Select the card group immediately, update URL/history without blocking content | Selection feels direct; network becomes background refresh, not a modal wait. |
| A DauToeic sync error can leave generic “loading” feedback until its timeout | One action-local progress button, deadline, retry, and error copy next to that button | The UI tells the truth and retains context. |
| Pet drag changes layout properties on every pointer event | `translate3d` position, rAF batching and pointer capture retained | Smoother drag with less layout work and no loss of tactile feedback. |
| Checkbox can be clicked repeatedly while profile PATCH is in flight | Switch is temporarily disabled and has clear “Đang lưu…” status | Prevents contradictory saves and makes the state machine obvious. |

**Motion verdict: Block release of additional interaction-heavy features until P0-1 through P0-4 are fixed and covered by tests.**

## Implementation plan

### Phase 0 — remove false blocking and save races

1. Create one `ActionState`/request helper with: immediate local pending UI, `AbortController` deadline, normalized error, cleanup in `finally`, and optional idempotency key for safely retryable writes.
2. Change vocabulary group controls from server-navigation links to a client selection model seeded from URL. Reflect the choice with the History API (including `popstate`) so deep links/back button work without repainting the entire route.
3. Remove `data-overdelay` from `DautoeicPartStudyButton`. Keep the button disabled only while its own sync is pending; on failure restore it immediately and show Retry. Route only after the sync succeeds.
4. In `saveAndComplete`, persist review/history as the critical transaction, surface the success toast immediately afterward, and delete the draft in the background. Do not retry a POST unless the server accepts an idempotency key.
5. Serialize pet profile saves. Disable/announce both switches while pending; accept the final server profile as canonical; do not roll back a newer mutation with an older failed request.

**Acceptance targets:** group selection visual state under 100 ms; no full-screen overlay for local choices; every pending mutation resolves to success, retryable error, or timeout within 10–12 seconds; completion feedback appears within 250 ms after critical persistence succeeds.

### Phase 1 — resilience and route cost

1. Add `(app)/error.tsx`, root `error.tsx`, and relevant `not-found.tsx` pages with Retry and safe Back/Home actions.
2. Add an application-level error/toast contract: one concise message per failed action, no stale global loader, no silent catch for user-visible requests.
3. Cache/dedupe global pet dashboard reads across routes and invalidate via `englishgo:pet-profile-updated` after a confirmed save.
4. Convert pet drag position to compositor-only transforms; persist only at drag end and clamp on resize.
5. Split `VocabSetDetailClient` dialogs and imports with dynamic imports; extract flashcard save/result state to a hook. Measure route JS after each split instead of optimizing blindly.

### Phase 2 — polish, observability and regression prevention

1. Pause nonessential pet animation on hidden documents and preserve current reduced-motion behavior.
2. Keep the current 150–260 ms transform/opacity language; do not add longer animation to hide data latency.
3. Add client timing around `vocab group`, `DauToeic sync`, `save complete`, `pet profile`, `leaderboard tab`, and API error/timeout counts. Vercel Speed Insights is already mounted; define budget alerts rather than relying on one manual audit.
4. Extend Playwright with a disposable Firebase test account and fixtures: vocabulary group selection, sync fail/timeout, save-success/save-timeout, pet double-toggle, mobile drag, route error boundary, and no-error overlay cleanup.

## Verification checklist after implementation

- [ ] `npm run lint`, unit tests and production build pass.
- [ ] Run the extended Playwright suite on desktop and mobile widths with a disposable user.
- [ ] Record median and p95 for the six critical flows on the deployed domain, not only localhost.
- [ ] Confirm `AppOverdelay` is never active after an action error/cancel.
- [ ] Confirm a double click/toggle creates only one profile request and the UI matches the final server response.
- [ ] Confirm successful vocabulary save updates both the result screen and parent progress after navigation.
- [ ] Inspect mobile drag with throttled CPU/network and reduced-motion enabled.

## Skills applied to this audit

Five relevant skills were used as requested:

1. Browser control — production page/control checks without submitting data.
2. Motion audit — performance and animation inventory.
3. Motion review — strict release verdict and Before/After/Why assessment.
4. UI design engineering — interaction feedback, hierarchy and component-boundary review.
5. Gesture/Apple interaction review — pointer drag, interruption, touch feedback and reduced-motion review.

## Implementation update — 15 July 2026

The P0–P2 fixes from this report are now implemented in the working tree:

- User-triggered vocabulary, pet, and DauToeic mutations use a 10-second client deadline, immediate local pending state, and an actionable error. The flashcard draft deletion no longer blocks completion.
- Vocabulary group selection is now a local, next-paint interaction (History API + `popstate`), rather than a full route navigation with the global loader.
- Pet mutations are serialized; floating-pet reads are deduplicated for 30 seconds; drag updates are scheduled with `requestAnimationFrame` and compositor transforms only.
- Added root/app error recovery and not-found pages, shorter non-critical navigation-overlay visibility, document-hidden pet animation pausing, client latency/budget telemetry, and a public error-page regression test.

Verification after the implementation: `npm run lint`, 46 unit tests, `npm run build`, and all 5 public Playwright regression tests passed. Authenticated E2E flows still require a disposable Firebase test account and must never use a real learner account.
