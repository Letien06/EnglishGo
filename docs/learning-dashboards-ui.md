# Reading, Writing and Vocabulary dashboards

The existing Listening visual system now also powers Reading, Writing and
Vocabulary. This is a presentation-only change: no framework, database schema,
storage migration, environment variable, authentication rule or API route changes.

## Files and responsibilities

- `web/src/app/(app)/_components/StudyDashboard.tsx` and
  `TestDashboardClient.tsx`: route both test libraries through the same dashboard;
  retain the existing account-scoped progress cache and requests.
- `web/src/app/(app)/_components/LearningDashboardUI.tsx`: reusable hero, statistics,
  tip and empty-state components for Writing/Vocabulary.
- `web/src/app/(app)/listen/_components/ListeningDashboard.tsx`,
  `ListeningHero.tsx`, `ListeningParts.tsx`, `ListeningTestCard.tsx`,
  `ListeningIcon.tsx`, `ListeningLoading.tsx`, `listening.module.css`,
  `listening-view-model.ts`, `useListeningPartProgress.ts`: extend the existing
  UI to Reading and share semantic colors, rings, 1/2/3-column grids, focus,
  skeletons and reduced-motion behavior. Names remain to avoid unrelated moves.
- `web/src/app/(app)/read/page.tsx`, `read/loading.tsx`: reuse the source catalog's
  year/difficulty metadata and the common loading UI.
- `web/src/app/(app)/writing/WritingLibraryClient.tsx`: common visual system,
  real recent AI scores, local search/filter/duration sort, collapsible topic
  chips, and original prompt thumbnails, keywords and practice/history links.
- `web/src/app/(app)/vocab/page.tsx`, `VocabLearnTabClient.tsx`,
  `VocabProgressTabClient.tsx`, `VocabMyTab.tsx`, `loading.tsx`: common page
  shell/catalog, mastery rings, local filters, search and sorting; semantic
  surfaces for other tabs and dialogs without changing mutations.
- `web/src/app/layout.tsx`, `web/src/components/ThemeToggle.tsx`: dark HTML,
  pre-hydration script and toggle fallback. Explicit saved light/dark choices
  with the existing manual-choice marker remain respected.
- Tests alongside the changed dashboards, shared view model/progress hook and
  theme toggle; `web/src/app/theme-default.test.ts` checks the inline bootstrap.

## Data semantics

- No new backend data is required. Reading uses the same test-part contract,
  practice parameters and reset endpoint. Part 5 resumes by question; Parts 6/7
  resume by group. Other Part totals load sequentially after active progress,
  through the existing Reading API, with account- and skill-scoped caching.
- Writing history uses the existing `part=N&limit=30` query for the selected Part.
  Counts refer only to current-library prompts present in those recent attempts.
  The average is the mean latest score/maxScore per represented prompt, not
  accuracy or an official ETS score. There is no fabricated draft/resume state.
  Failed or pending private scores display dashes and never block opening prompts.
- Vocabulary displays the bundled catalog immediately. Its existing background
  progress request remains separate; search, filters, sort and group changes add
  no requests. Completion means all words mastered, not merely encountered.
  Due words may overlap mastered/learning words; the three chips are not a partition.
- Theme defaults to dark only when there is no valid explicit choice, including
  when storage is unavailable. The toggle still persists both preferences.

## Verification

From `web`, run `npm test`, `npx tsc --noEmit`, `npm run lint` and the
configured production build. Use the existing local Drive content bundle for
build validation rather than fetching or changing remote content.

Manual checklist:

1. Open /read?part=part5, /writing and /vocab after signing in; inspect both themes.
2. Check widths 320/390, 768 and 1440px for overflow, 1/2/3 card columns and legible
   labels, counts and controls. Use Tab/Shift+Tab and inspect visible focus rings.
3. Try search, status filters, sorting and empty-state reset. In Writing, try
   grammar pairs, expanded topic filters and all three Parts.
4. Keep private progress pending or fail its request: practice links must remain
   usable and unknown statistics must not turn into invented zeros.
5. Verify Reading links/resume indices and reset cancellation. Only reset
   disposable progress; automated tests verify the endpoint/payload.
6. Toggle light, reload and confirm it remains light. In a fresh browser context,
   dark should render before hydration. Enable reduced motion to disable motion.
7. Confirm Vocabulary group selection updates the existing query and browser
   Back restores the group; original study/game/detail links remain unchanged.

Local visual QA used temporary development-only Reading/Vocabulary fixtures
plus the real public Writing and Vocabulary catalogs. No personal progress was
modified. The preview route is removed before delivery; ignored screenshots
remain in `web/.seed-tmp`. Live authenticated history was covered by mocked API
tests rather than signing into or changing the user's study data.
