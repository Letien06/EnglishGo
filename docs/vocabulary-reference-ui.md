# Vocabulary workspace refresh

## Reference observations

Inspected DauEnglish vocabulary catalog, Test 2, Word Blast, Vocabulary Rain,
and word explorer in the browser on 2026-10-03. User screenshots also cover
matching and quiz. Reuse interaction ideas, not their branding or assets.

- Compact catalog: three explicit entry points (view, learn, play).
- Study workspace: persistent part navigation and centered activity tabs.
- Blast: four moving English targets, Vietnamese clue, cannon, three lives.
- Rain: multiple independently falling clues, progressive letter hints,
  shared English input, missed words cost lives, pause and score feedback.
- Matching: mixed English/Vietnamese tiles; quiz: clear numbered choices.

## Scope and implementation order

1. Catalog and existing route query propagation; no new data storage.
2. Workspace part sidebar and game selection using existing APIs.
3. Animated Blast and concurrent Rain with local deterministic state reducers.
4. Matching/word explorer polish, regression tests, responsive visual checks.

Existing result save callbacks remain authoritative. No leaderboard, invented
records, multiplayer, new dependencies, or background writes are introduced.
Part metadata loads independently so words are not blocked by extra requests.
Movement uses transforms; reduced-motion keeps fixed targets with timers.
Pause, page visibility, leave confirmation, and unmount stop game time.

## Verification

Run vocabulary component/reducer tests, TypeScript, lint, and production build.
Check desktop/mobile, dark/light, direct tab entry, pause/resume, concurrent
rain answers, misses, keyboard shortcuts, long words, and empty data.

## Changed files

Paths below are relative to `web/src/app/(app)/vocab/` unless stated otherwise.

- `VocabLearnTabClient.tsx`: compact cards, direct activity links, local filters.
- `dautoeic/[testId]/page.tsx`, `DautoeicPartsClient.tsx`, and
  `DautoeicPartStudyButton.tsx`: carry the selected activity through login,
  existing part selection, and sync fallback.
- `[setId]/flashcards/page.tsx`: passes the existing storage-ready flag as the
  view-only `partsReady` prop; no new backend field or database migration.
- `[setId]/flashcards/FlashcardGame.tsx` and `VocabularySidebar.tsx`: responsive
  workspace, part metadata in the background, guarded navigation during play.
- `[setId]/flashcards/vocabulary.module.css`: scoped themes, arena visuals,
  responsive grid, focus styles, and reduced-motion variants.
- `[setId]/flashcards/modes/VocabularyArcade.tsx` and `VocabularyRain.tsx`:
  moving targets, shot feedback, concurrent rain, pause, keyboard/touch input.
- `[setId]/flashcards/modes/MatchingMode.tsx` and `QuizMode.tsx`: mixed tiles
  and numbered full-width answers with pronunciation controls.
- `web/src/lib/vocab-rain.ts`: local concurrent-game reducer; no network writes.
- Associated catalog, sidebar, route, arcade, and rain reducer tests.

Verified with the full Vitest suite, TypeScript, ESLint, and `next build` using
the existing local Drive content cache. Browser checks used disposable fixture
data at desktop and phone widths, dark and light themes. The fixture route was
removed afterwards. Live-account progress writes were not part of visual QA.
Screenshots are in the ignored `web/.seed-tmp/vocab-*.png` files.
