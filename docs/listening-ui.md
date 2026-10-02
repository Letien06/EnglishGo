# Listening dashboard UI

## Scope

The `/listen?part=part1` through `part4` pages use the existing Next.js 16,
React and Tailwind stack, as confirmed for this repository. No new dependency,
API route, database field, environment variable or content migration is required.
The application header, reading dashboard and practice workspace are unchanged.
The design follows `.agents/skills/emil-design-eng/SKILL.md` and `web/AGENTS.md`.
No `workflow.md` was present in the repository.

## Changed files

Paths below are relative to the repository root.

- `web/src/app/(app)/_components/StudyDashboard.tsx`: selects the listening-only presentation.
- `web/src/app/(app)/_components/TestDashboardClient.tsx`: preserves progress loading, reset invalidation and account isolation; exposes whether private progress is resolved.
- `web/src/app/(app)/_components/TestDashboardClient.test.tsx`: account isolation and reading regression checks.
- `web/src/app/(app)/listen/loading.tsx`: listening-specific route fallback.
- `web/src/app/(app)/listen/page.tsx`: adds existing source year/difficulty metadata to the page view model in parallel with the unchanged Part catalog.
- `web/src/app/(app)/listen/_components/ListeningDashboard.tsx`: page composition and local filtering state.
- `web/src/app/(app)/listen/_components/ListeningHero.tsx`: resume action, selected-Part statistics and streak.
- `web/src/app/(app)/listen/_components/ListeningParts.tsx`: Part navigation and pending-link state.
- `web/src/app/(app)/listen/_components/ListeningToolbar.tsx`: status filters, search and sorting.
- `web/src/app/(app)/listen/_components/ListeningTestCard.tsx`: progress rings, status chips and unchanged practice/reset actions.
- `web/src/app/(app)/listen/_components/ListeningIcon.tsx`: local inline SVG icons; no image downloads.
- `web/src/app/(app)/listen/_components/ListeningLoading.tsx`: route and Part-switch skeletons.
- `web/src/app/(app)/listen/_components/listening.module.css`: scoped theme/spacing tokens, responsive grids and reduced-motion rules.
- `web/src/app/(app)/listen/_components/listening-view-model.ts`: presentation-only summaries, estimates, filters and route builders.
- `web/src/app/(app)/listen/_components/useListeningStreak.ts`: read-only use of the existing streak endpoint.
- `web/src/app/(app)/listen/_components/useListeningPartProgress.ts`: background summaries for the other Parts, cached per account for five minutes.
- `web/src/app/(app)/listen/_components/ListeningDashboard.test.tsx`: UI, filtering, reset and streak checks.
- `web/src/app/(app)/listen/_components/listening-view-model.test.ts`: pure presentation-model checks.
- `web/src/app/(app)/listen/_components/useListeningPartProgress.test.tsx`: background-request and identity-isolation checks.
- `docs/listening-ui.md`: this implementation and verification guide.

## Data and performance

- Test cards render from the existing server catalog without waiting for private progress.
- Hero question counts and accuracy cover only the selected Part. Accuracy is `correct / (correct + wrong)`; unavailable values display a dash, not a fabricated zero.
- Resume chooses an unfinished test in catalog order. The current API has no last-practiced timestamp, so the UI does not claim it is the most recently used test.
- `nextIndex` is a zero-based item index. Parts 1/2 display a question position; Parts 3/4 display a conversation/talk-group position. Existing `q`, `mode`, `testId` and reset payloads remain unchanged.
- `/api/study/streak` supplies real streak days and today's activity status. Loading or failed responses never claim a streak value.
- Once selected-Part progress is ready, the other three Parts load sequentially in the background through the existing `/api/listening/tests?part=N` endpoint. Unknown Part totals say to open the Part instead of inventing a denominator. Requests are aborted on navigation and account changes; responses for another account are rejected.
- Filters/search/sorting do not request data. The sorting selection operates inside the existing source-set groups.
- Estimated minutes use question count and an explicit per-Part practice estimate. They are not a timer or a measured completion duration.
- The page view model reuses `year` and `difficultyLevel` from the existing test catalog. Newest-first means publication year, not creation or last-practiced time. Difficulty is the source test's numeric level, not a new assessment of the selected Part. Missing metadata remains explicitly unclassified; newest-first is disabled if no source years are available. No new backend field is required.
- CSS, inline SVG and the existing fonts provide all decoration. No animation library or remote illustration is added.

## Verification

From `web`, run `npm test`, `npx tsc --noEmit`, `npm run lint` and the configured production build.

For manual QA, sign in and open `/listen?part=part1`:

1. Toggle light/dark using the existing header control. Inspect hero text, status chips, form controls and focus rings.
2. Check 320/390px mobile, 768px tablet and 1440px desktop widths. Cards must form 1/2/3 columns, respectively, without horizontal page scrolling.
3. Use Tab/Shift+Tab and Enter/Space for controls. Test status chips, accent-insensitive search, progress sorting and the empty-state reset action.
4. Navigate between Parts with a slow connection. The pending link and test-grid skeleton should appear while navigation waits; header navigation remains available.
5. Confirm an unfinished test resumes at the existing `q` index. Test reset only on disposable progress; canceling its confirmation must leave data unchanged.
6. Switch accounts or sign out. Old progress and streak must not remain visible for the new account.
7. Enable the browser/OS reduced-motion preference. Card movement, stagger, hover lift and skeleton pulse must stop.

Local visual QA used a temporary, development-only fixture with new, unfinished
and completed tests; it did not write personal learning data. The fixture is
removed before delivery. Screenshots are kept under the ignored
`web/.seed-tmp/listening-qa` directory. They illustrate the UI, not live user statistics.
