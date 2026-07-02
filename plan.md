# Dau TOEIC Reading Integration Plan

## Goal

Build the Reading module around Dau TOEIC API data, similar to the current Listening flow, while keeping all learner state inside ENGLISHGO.

Main goals:

- Use Dau TOEIC API as the runtime content source for TOEIC Reading Parts 5, 6, and 7.
- Keep `/read` as the Reading dashboard, but change it from mostly internal fallback content to API-backed level practice.
- Add `/read/practice` for Part + Level practice sessions.
- Reuse the current backend proxy pattern from Listening instead of calling Dau TOEIC directly from the browser.
- Store user progress, favorites, notes, vocabulary basket, and reset state locally in ENGLISHGO.
- Do not write Dau TOEIC content into ENGLISHGO question-bank tables as copied content; only fetch and render at runtime, then store learner-owned metadata by source item/question ids.

## 1. Current State In Repo

Listening already has the target pattern:

```text
/listen
-> ListenController
-> DauToeicClientService.listDifficultyLevels(part)
-> ListeningProgressService.applyProgress(userId, levels)
-> listen/index.html level cards

/listen/practice?part=1&level=1&mode=normal&assist=30
-> ListenController
-> DauToeicClientService.getDifficultySession(part, level, limit)
-> listen/practice.html
-> listen-practice.js saves local progress/tools
```

Existing API proxy:

```text
GET /api/dautoeic/tests/{testId}/reading?part=5
GET /api/dautoeic/tests/{testId}/parts/{part}
GET /api/dautoeic/difficulty/parts/{part}/levels
GET /api/dautoeic/difficulty/parts/{part}/levels/{level}
```

Current limitation:

```text
DauToeicClientService.listDifficultyLevels(part)
DauToeicClientService.getDifficultySession(part, level, limit)

These methods currently call requireListeningPart(part), so they only accept parts 1-4.
```

Current `/read`:

```text
/read
-> ReadController
-> internal LearnerContentService fallback questions and lessons
-> read/index.html
```

Reading does not yet have:

- API-backed level dashboard.
- API-backed practice screen.
- Local reading progress table.
- Reading notes/favorites/vocab/reset endpoints.
- Reading practice JS.

## 2. Dau TOEIC API Data Sources

The existing client already uses the Dau TOEIC Supabase REST API:

```text
Base URL: app.dautoeic.supabase-url
Auth: apikey + Authorization Bearer app.dautoeic.anon-key
Media: app.dautoeic.media-base-url
```

Already used tables/RPC:

```text
GET  /rest/v1/mock_test_sets
GET  /rest/v1/mock_tests
GET  /rest/v1/mock_test_questions
GET  /rest/v1/mock_test_passages
POST /rest/v1/rpc/get_practice_stats
```

Expected difficulty request for Reading:

```text
POST /rest/v1/rpc/get_practice_stats
body: { "p_part": 5 }
body: { "p_part": 6 }
body: { "p_part": 7 }
```

Expected response fields, same shape as Listening:

```text
part
difficulty_level
item_id
item_type
error_rate
total_attempts
wrong_count
```

Implementation note:

- First verify that `get_practice_stats` returns rows for parts 5-7.
- If it does, use the same level grouping as Listening.
- If it does not, fallback for MVP should group by `mock_tests.difficulty_level` or `mock_test_questions.difficulty_level`, then later add a proper Reading stats RPC.

## 3. Product Flow

### Reading Dashboard

```text
User opens /read?part=part5
-> backend normalizes active part to 5
-> backend calls Dau TOEIC difficulty stats for part 5
-> backend overlays local user progress
-> UI renders 5 level cards
-> user clicks "Luyen ngay"
-> /read/practice?part=5&level=1&mode=normal&assist=30
```

### Reading Practice

```text
User opens /read/practice?part=6&level=2
-> backend calls Dau TOEIC difficulty session for part 6 level 2
-> backend fetches matching questions/passages
-> UI renders passage + grouped questions
-> user answers A/B/C/D
-> JS checks correct answer locally from payload
-> JS POSTs progress to ENGLISHGO
-> UI shows explanation/translation/vocabulary
```

### Local State

```text
Answer progress
-> POST /api/reading/progress
-> save user_id + source + part + level + item_id + question_id + selected/correct answer

Favorite
-> POST /api/reading/favorites
-> toggle by user_id + item_id + question_id

Notes
-> POST /api/reading/notes
-> save learner note by user_id + item_id + question_id

Vocabulary basket
-> POST /api/reading/vocab-basket
-> save learner-selected word/meaning/example

Reset level
-> POST /api/reading/reset
-> delete local progress for user_id + part + level
```

## 4. Reading Part Mapping

### Part 5: Incomplete Sentences

Dau TOEIC source:

```text
mock_test_questions
part = 5
item_id = mock_test_questions.id
```

Fields to render:

```text
question_text
option_a
option_b
option_c
option_d
correct_answer
explanation_vi
explanation_en
dich_nghia
tu_vung
dich_nghia_dap_an
difficulty_level
question_number
```

UI:

```text
No passage pane required.
Main card shows one sentence/question.
Answer choices A-D.
After answer, show correct/wrong, explanation, Vietnamese translation, vocabulary.
```

### Part 6: Text Completion

Dau TOEIC source:

```text
mock_test_passages
part = 6
item_id = mock_test_passages.id

mock_test_questions
passage_id = mock_test_passages.id
```

Fields to render:

```text
passage.title
passage.passage_text
passage.passage_text_2
passage.passage_text_3
questions grouped by passage_id
question_text/options/correct/explanations/translations
```

UI:

```text
Left pane: passage with stable scroll position.
Right pane: grouped questions for that passage.
Question navigation within passage.
Answering one question should not move the whole passage unless Auto is enabled.
```

### Part 7: Reading Comprehension

Dau TOEIC source:

```text
mock_test_passages
part = 7
item_id = mock_test_passages.id

mock_test_questions
passage_id = mock_test_passages.id
```

Fields to render:

```text
title
passage_type
passage_text
passage_text_2
passage_text_3
image_url if present
questions grouped by passage_id
```

UI:

```text
Support single, double, and triple passage sets.
Show passage tabs/sections for passage_text, passage_text_2, passage_text_3.
Keep question list visible beside the passage on desktop.
Stack passage then questions on mobile.
```

## 5. Backend Design

### New DTOs

Prefer reusing common Dau TOEIC DTOs where shape matches:

```text
DauToeicDifficultyLevelResponse
DauToeicDifficultySessionResponse
DauToeicPracticeItemResponse
DauToeicQuestionResponse
DauToeicPassageResponse
```

Add Reading-specific DTOs only if UI needs fields that would make the listening DTO names misleading:

```text
ReadingProgressRequest
ReadingProgressResponse
ReadingProgressSummary
ReadingToolRequest
ReadingToolResponse
```

Recommended progress request:

```json
{
  "part": 5,
  "level": 1,
  "itemId": "question-or-passage-id",
  "questionId": "question-id",
  "selectedAnswer": "A",
  "correctAnswer": "B",
  "modeUsed": "normal",
  "assistPercent": 30,
  "elapsedSeconds": 42
}
```

### DauToeicClientService Changes

Refactor part validation:

```text
requireToeicPart(part): 1-7
requireListeningPart(part): 1-4
requireReadingPart(part): 5-7
```

Add public methods:

```text
listReadingDifficultyLevels(int part)
getReadingDifficultySession(int part, int level, Integer limit)
```

Implementation:

```text
listReadingDifficultyLevels(part)
-> requireReadingPart(part)
-> practiceStats(part)
-> group by difficulty_level 1-5
-> return level responses

getReadingDifficultySession(part, level, limit)
-> requireReadingPart(part)
-> practiceStats(part)
-> filter by level
-> Part 5: fetch questions by ids
-> Part 6/7: fetch passages by ids + grouped questions
-> return session response
```

Important ordering:

```text
Keep the stats order from get_practice_stats first.
Within grouped Part 6/7 items, sort questions by question_number.
```

### API Routes

Keep existing generic routes if desired, but add explicit Reading routes for clarity:

```text
GET /api/dautoeic/reading/parts/{part}/levels
GET /api/dautoeic/reading/parts/{part}/levels/{level}?limit=20
GET /api/dautoeic/tests/{testId}/reading?part=5
```

Response shape:

```json
{
  "success": true,
  "data": {
    "part": 6,
    "level": 2,
    "title": "Level 2 - Co ban",
    "total": 20,
    "items": []
  },
  "error": null
}
```

### Controller Changes

ReadController:

```text
Inject DauToeicClientService.
Inject ReadingProgressService.
Accept @AuthenticationPrincipal AppUserPrincipal.
Normalize part:
  grammar -> keep internal lessons/fallback
  part5 -> 5
  part6 -> 6
  part7 -> 7
  bilingual -> part7 + mode=bilingual shortcut
```

Dashboard model:

```text
parts
activePart
dauToeicReadingLevels
readingUserAuthenticated
dauToeicError
questions/lessons as internal fallback only
```

Add:

```text
GET /read/practice
params: part=5, level=1, mode=normal, assist=30, q=0
model: practiceSession, selectedLevel, selectedMode, assistPercent, assistOptions
view: read/practice
```

## 6. Local Database Tables

Create new Flyway migrations for both MySQL and PostgreSQL if the repo keeps dual migration folders.

### `reading_progress`

```text
id BIGINT PK
user_id BIGINT NOT NULL FK users(id)
source VARCHAR(30) NOT NULL DEFAULT 'DAUTOEIC'
part INT NOT NULL
level INT NOT NULL
item_id VARCHAR(100) NOT NULL
question_id VARCHAR(100) NOT NULL
selected_answer VARCHAR(10)
correct_answer VARCHAR(10)
is_correct BOOLEAN NOT NULL
mode_used VARCHAR(30) NOT NULL DEFAULT 'normal'
assist_percent INT NOT NULL DEFAULT 30
elapsed_seconds INT NOT NULL DEFAULT 0
completed_at TIMESTAMP NOT NULL
created_at TIMESTAMP NOT NULL
updated_at TIMESTAMP NOT NULL
unique(user_id, question_id)
index(user_id, part, level)
```

### `reading_notes`

```text
id BIGINT PK
user_id BIGINT NOT NULL FK users(id)
item_id VARCHAR(100) NOT NULL
question_id VARCHAR(100)
note TEXT NOT NULL
created_at TIMESTAMP NOT NULL
updated_at TIMESTAMP NOT NULL
unique(user_id, item_id, question_id)
```

### `reading_favorites`

```text
id BIGINT PK
user_id BIGINT NOT NULL FK users(id)
item_id VARCHAR(100) NOT NULL
question_id VARCHAR(100)
created_at TIMESTAMP NOT NULL
unique(user_id, item_id, question_id)
```

### `reading_vocab_basket`

```text
id BIGINT PK
user_id BIGINT NOT NULL FK users(id)
word VARCHAR(255) NOT NULL
meaning VARCHAR(1000)
example TEXT
source_item_id VARCHAR(100)
source_question_id VARCHAR(100)
created_at TIMESTAMP NOT NULL
```

## 7. Reading Services

### ReadingProgressService

Responsibilities:

```text
applyProgress(userId, levelResponses)
summarize(userId, part, level)
record(userId, ReadingProgressRequest)
validate part 5-7
validate level 1-5
normalize selected/correct answer
upsert by user_id + question_id
```

Correctness:

```text
isCorrect = normalize(selectedAnswer).equals(normalize(correctAnswer))
```

Guest behavior:

```text
If user is null, return saved=false but still return isCorrect=true/false.
Do not block guest practice.
UI should show "Dang nhap de luu tien do" after answer.
```

### ReadingToolService

Responsibilities:

```text
saveNote(userId, request)
toggleFavorite(userId, request)
addVocab(userId, request)
resetLevel(userId, request)
```

Guest behavior:

```text
Return saved=false with login message.
Do not throw 401 for normal learner flow.
```

## 8. Frontend Design

### `/read` Dashboard

Keep the existing Reading sidebar but make Part 5-7 API-first:

```text
Sidebar:
- Grammar
- Part 5
- Part 6
- Part 7
- Doc song ngu

Hero:
- label: Du lieu Dau TOEIC API
- title from active part
- short description from active part

Main:
- for grammar: lessons + internal question bank
- for part5/part6/part7/bilingual: level dashboard
- fallback: internal approved questions if API fails or returns empty
```

Level cards:

```text
Level 1 - De
Level 2 - Co ban
Level 3 - Trung binh
Level 4 - Kho
Level 5 - Rat kho

Each card:
- error rate range
- total items
- done/correct/wrong/remaining
- totalAttempts/wrongAttempts from Dau TOEIC stats
- Reset button
- Luyen ngay button
```

### `/read/practice`

Template:

```text
src/main/resources/templates/read/practice.html
```

JS:

```text
src/main/resources/static/js/read-practice.js
src/main/resources/static/js/read-dashboard.js
```

Desktop layout:

```text
Topbar:
- Exit to /read?part=part5
- Part + Level title
- mode controls
- assist percent
- elapsed time
- auto next

Main:
- Part 5: question pane centered, optional explanation panel below
- Part 6/7: passage pane left, question pane right

Bottom:
- Report
- Vocab basket
- Notes
- Previous / current / Next
```

Mobile layout:

```text
Topbar compact.
Passage appears before questions.
Sticky bottom pager.
Notes/vocab panels open inline.
```

## 9. Reading Learning Modes

Use the same mode names as Listening to keep URLs stable:

```text
normal
bilingual
fill
flip
```

### Normal

```text
Show English passage/question/options.
User answers A-D.
Show correct/wrong + explanation.
Save progress.
```

### Bilingual

```text
Show Vietnamese translation when available:
- question.dich_nghia
- question.dich_nghia_dap_an
- question.explanation_vi
- question.tu_vung

Do not change scoring.
```

### Fill-word

For Reading, fill mode should apply to passage text and/or answer options, not audio transcript.

Algorithm:

```text
Input: passage/question/options text
assist_percent: 30 / 50 / 100
Tokenize English words.
Hide meaningful words.
Render hidden words as inputs.
Check typed word locally.
Still require A-D answer for scoring.
```

Recommended scope:

```text
Part 5: hide words in answer options.
Part 6: hide words in the passage around blanks and answer options.
Part 7: hide words in selected passage paragraphs only, because full Part 7 passages can be long.
```

### Flip-word

```text
Use the same hidden-word selection as Fill-word.
Render hidden words as chips.
Click chip or "Lat tu tiep" to reveal.
Still require A-D answer for scoring.
```

### Assist Percent

```text
30%: beginner support
50%: medium challenge
100%: intensive vocabulary reconstruction
```

## 10. Error, Empty, And Fallback States

API not configured:

```text
Show: "Chua cau hinh Dau TOEIC API."
Render internal fallback questions/lessons if available.
```

Dau TOEIC API error:

```text
Show: "Khong tai duoc du lieu doc tu Dau TOEIC."
Do not crash page.
Expose JSON endpoint error through ApiResponse error via GlobalExceptionHandler.
```

No level stats:

```text
Show empty state for selected part.
Offer internal approved questions.
```

No practice items:

```text
Show: "Level nay chua co du lieu doc."
Link back to /read?part=partX.
```

Guest user:

```text
Allow answering.
Show result.
Return saved=false for progress/tools.
Prompt login only for persistence.
```

## 11. Test Plan

### Unit/Controller Tests

Add/extend:

```text
DauToeicControllerTest
- reading levels endpoint returns level cards for part 5
- reading session endpoint returns Part 5 item
- reading session endpoint returns Part 6 grouped passage
- reading session endpoint returns Part 7 grouped passage
- invalid reading part rejects part 4/8

ReadControllerTest
- /read?part=part5 renders Dau TOEIC level dashboard
- /read?part=part7 overlays authenticated progress
- /read/practice?part=6&level=1 renders read/practice
- API failure falls back to internal questions

ReadingProgressServiceTest
- guest returns saved=false but isCorrect computed
- authenticated upserts by question_id
- rejects part outside 5-7
- summarize returns done/correct/wrong

ReadingToolServiceTest
- notes require login
- favorite toggles
- vocab basket saves
- reset deletes selected part/level
```

### Manual Browser QA

```text
/read?part=part5
/read?part=part6
/read?part=part7
/read/practice?part=5&level=1
/read/practice?part=6&level=1
/read/practice?part=7&level=1
```

Verify:

```text
Level cards load.
Practice items load.
Correct answer feedback works.
Progress saves after login.
Guest mode still answers.
Reset updates level card counts.
Part 6/7 passages do not overlap questions.
Mobile layout does not overflow.
```

## 12. Implementation Phases

### Phase 1: Verify Reading API Shape

```text
Call get_practice_stats for p_part 5, 6, 7 in dev.
Confirm whether item_id points to mock_test_questions for Part 5.
Confirm whether item_id points to mock_test_passages for Part 6/7.
Confirm media/image fields used by Part 7.
Document any field mismatch before coding UI.
```

### Phase 2: Backend Reading Difficulty API

```text
Refactor part validators in DauToeicClientService.
Add listReadingDifficultyLevels.
Add getReadingDifficultySession.
Add explicit /api/dautoeic/reading/parts/{part}/levels routes.
Add tests for Part 5-7.
```

### Phase 3: Reading Dashboard

```text
Update ReadController to load API levels for Part 5-7.
Keep Grammar on lessons/internal question bank.
Update read/index.html to show level dashboard.
Add read-dashboard.js for reset button.
Keep internal approved questions as fallback.
```

### Phase 4: Reading Practice Screen

```text
Add /read/practice route.
Add read/practice.html.
Add read-practice.js.
Render Part 5 question-only items.
Render Part 6/7 passage-grouped items.
Support previous/next, answer feedback, solution panel.
```

### Phase 5: Local Reading Progress

```text
Add reading_progress migrations for MySQL and PostgreSQL.
Add entity/repository/service/controller.
POST /api/reading/progress.
Overlay progress onto level cards.
```

### Phase 6: Reading Tools

```text
Add reading_notes.
Add reading_favorites.
Add reading_vocab_basket.
Add POST /api/reading/notes.
Add POST /api/reading/favorites.
Add POST /api/reading/vocab-basket.
Add POST /api/reading/reset.
```

### Phase 7: Bilingual, Fill-word, Flip-word

```text
Port hidden-word engine from listen-practice.js into a shared helper or duplicate narrowly for read-practice.js first.
Add bilingual answer/passage translations.
Add fill-word mode for selected text.
Add flip-word mode for selected text.
Keep A-D answer as the scored action.
```

### Phase 8: Polish And QA

```text
Keyboard shortcuts: 1-4 choose A-D, left/right navigate, Tab hint/reveal.
Elapsed time display.
Responsive passage/question layout.
Accessible labels and aria-live feedback.
Run mvn test.
Manual browser pass on desktop and mobile.
```

## 13. Open Questions Before Implementation

1. Does `get_practice_stats` currently support `p_part` 5, 6, and 7 in Dau TOEIC?
2. For Part 6, does `item_id` always point to `mock_test_passages.id`, or sometimes to `mock_test_questions.id`?
3. For Part 7, should a practice item be one passage group, or should long multi-passage sets be split by question?
4. Should `/read` default to `grammar` as today, or switch default to `part5` once API-backed reading is ready?
5. Should Reading progress reuse listening table names with a generic `skill_type`, or create dedicated reading tables? Recommended for MVP: dedicated reading tables to avoid risky migration/refactor of existing Listening code.

## 14. Definition Of Done

Reading API integration is done when:

```text
/read?part=part5 shows API-backed level cards.
/read?part=part6 shows API-backed level cards.
/read?part=part7 shows API-backed level cards.
/read/practice?part=5&level=1 renders answerable Dau TOEIC questions.
/read/practice?part=6&level=1 renders passage + grouped questions.
/read/practice?part=7&level=1 renders single/multi passage + grouped questions.
Authenticated user progress is saved locally.
Guest user can practice without saving.
Reset, note, favorite, and vocab basket work for authenticated users.
Internal question-bank fallback still renders when Dau TOEIC API fails.
Controller/service tests cover the new routes and progress behavior.
`mvn test` passes.
```
