# UI consistency audit — 7 October 2026

Reviewed all 39 page templates, their dependent UI components, navigation, and explicit or inherited loading/error states. The shared visual language is consistent after this pass; focused practice, timed exams, the game arena, and public marketing retain layouts suited to their tasks.

## Changes

| Before | After | Why |
| --- | --- | --- |
| Mascot encouragement required an arrow click | Eight messages rotate every 5 seconds; arrow removed | Encouragement works automatically |
| Different message lengths could change the bubble height | Overlaid grid reserves the longest message footprint | Keeps the surrounding dashboard stable |
| Timer continued regardless of tab visibility | Pauses while hidden and restarts a full interval on return; cleans up on unmount | Avoids unnecessary background work |
| Fixed pale dictation/admin/account colors | Shared surface, ink, border and status tokens | Readable in light and dark themes |
| White text on gold controls | Dark gold ink | Improves control contrast |
| Duplicate page headings and account controls in legacy headers | Shared content header with one page H1; account navigation stays in AppShell | Clear page hierarchy |
| Wide leaderboard rows and horizontal password controls on narrow screens | Responsive board columns and stacked account controls | Preserves space for names and inputs |
| Mixed interface languages | Vietnamese static labels in community, writing, AI and admin UI | Consistent interface language; learning content and API values preserved |
| Generic exam/community loading footprints | Route-specific skeletons and matching shared headers | Reduces loading-to-content layout shifts |
| Reading Part 5 used a two-pane loader | Centered single-question footprint; Parts 6/7 keep the passage pane | Matches the ready practice layout |
| Listening exposed technical failure detail; reading redirected silently | Shared retry/back/empty state | Makes temporary data failures understandable |
| Small dashboard close and score tap targets | 44px close control and expanded score hit areas | Easier touch interaction without crowding score inputs |

## Source coverage

| Page family | Reviewed routes |
| --- | --- |
| Public (3) | `/`, `/login`, `/lessons` |
| Dashboard/account/ranking/aliases (5) | `/hub`, `/account`, `/leaderboard`, `/continue`, `/progress` |
| Listening (4) | `/listen`, `/listen/practice`, `/listen/dictation`, `/listen/dictation/[lessonId]` |
| Reading (2) | `/read`, `/read/practice` |
| Vocabulary (4) | `/vocab`, `/vocab/[setId]`, `/vocab/[setId]/flashcards`, `/vocab/dautoeic/[testId]` |
| Exams (4) | `/practice`, `/practice/history`, `/practice/session/[testId]`, `/practice/review/[attemptId]` |
| Writing (4) | `/writing`, `/writing/practice/[promptId]`, `/writing/history`, `/ai/writing` |
| Community (3) | `/community`, `/community/contribute`, `/community/leaderboard` |
| Admin (10) | `/admin`, `/admin/[module]`, `/admin/content-modules`, `/admin/content-quality`, `/admin/content-review`, `/admin/generate`, `/admin/media`, `/admin/writing`, `/admin/dictation`, `/admin/dictation/import` |

Global and app error boundaries and the not-found screen were also reviewed. `/continue` and `/progress` remain redirects to `/hub`.

## Validation

- Full unit suite: 99 files passed, 586 tests passed; 10 live smoke tests skipped by their existing environment gate.
- Production build and TypeScript validation passed.
- ESLint passed for changed files except `FlashcardGame.tsx`, which has existing effect/typing findings outside the two button-color edits. The remaining changed files and the entire admin folder pass.
- Browser checks cover representative layouts and responsive/theme states. They do not constitute visual testing of every dynamic question, vocabulary set, user record or admin content item.

This pass does not change authentication, permissions, grading, saved learning progress, content publishing behavior or the Firebase billing plan.
