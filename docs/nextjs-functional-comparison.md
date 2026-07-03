# Next.js Functional Comparison

Phase 6 comparison between the old Spring Boot + Thymeleaf application and the new Next.js App Router implementation in `web/`.

| Area | Java URL / Source | Next.js URL / Source | Status | Notes |
|---|---|---|---|---|
| Health | `/api/health` | `/api/health` | Complete | Standard `{ success, data, error }` envelope verified by Playwright smoke test. |
| Login/session | `/login`, `/api/auth/session` | `/login`, `/api/auth/session` | Complete | Firebase client login sets httpOnly session cookie through route handler. |
| Hub | `/hub` | `/hub` | Complete | Reads Firestore user, attempts, and vocab progress; covered by Vitest service test. |
| Vocabulary learn/progress/my/community | `/vocab`, `/vocab/*`, `/api/vocab/*` | `/vocab`, `/vocab/*`, `/api/vocab/*` | Mostly complete | Firestore-backed CRUD, AI preview/save, import, flashcards, and review routes are present. |
| Listening dashboard/practice | `/listen`, `/listen/practice`, `/api/listening/*` | `/listen`, `/listen/practice`, `/api/listening/*` | Complete enough for migrated flow | DauToeic sessions, progress, notes, favorites, and vocab basket routes are present. |
| Reading dashboard/practice | `/read`, `/read/practice`, `/api/reading/*` | `/read`, `/read/practice`, `/api/reading/*` | Complete enough for migrated flow | Reading practice currently reuses the shared practice client bridge and reading-specific API routes. |
| Practice tests | `/tests`, `/mock-test`, `/tests/{id}/practice` | `/practice`, `/practice/session/{id}` | Complete | Loads DauToeic content, saves drafts under user subcollections, submits attempts, grades score. |
| Practice history/review | `/history`, `/attempts/{id}/review` | `/practice/history`, `/practice/review/{id}` | Complete | Attempts are stored in `users/{uid}/practiceAttempts`. |
| Community | `/community`, `/leaderboard`, `/contribute` | `/community`, `/community/leaderboard`, `/community/contribute` | Complete | Comments, leaderboard, and contribution audit log routes are present. |
| AI writing | `/ai/writing` | `/ai/writing`, `/api/ai/writing` | Complete | Serverless-safe direct scoring/stub feedback stores completed jobs in Firestore. |
| Account | `/account` | `/account`, `/api/account/*` | Complete | Profile and password updates use Firestore and Firebase Admin Auth. |
| Billing | `/billing`, `/billing/checkout` | `/billing`, `/api/billing/checkout` | Complete | Plans, active subscription, transactions, and checkout write to Firestore subcollections. |
| Admin dashboard/modules | `/admin`, `/admin/*` | `/admin`, `/admin/*` | Complete | ADMIN-only pages port the disabled/stub admin state plus metrics. |
| Media upload | Local `/media/**` files | Firebase Storage URLs via `/api/admin/media` | Complete | Vercel-safe upload path stores objects in Firebase Storage and metadata in `mediaAssets`. |

## Permission Checks

Protected application routes are guarded by `web/src/middleware.ts` for session-cookie redirects. Server-side actions that need identity call `requireUser()`. Admin pages and API routes call `requireRole("ADMIN")`.

## Responsive Checks

The migrated pages use the shared app shell and responsive Tailwind grids. Manual browser QA should still cover mobile layouts for dense flows: `/practice/session/{id}`, `/vocab`, `/listen/practice`, `/read/practice`, and `/admin/media`.

## Residual Risks

External DauToeic content depends on `DAUTOEIC_ANON_KEY` and the remote Supabase schema. Firebase Storage upload depends on the Firebase bucket existing and `FIREBASE_STORAGE_BUCKET` matching the project bucket when the default bucket name is not used.
