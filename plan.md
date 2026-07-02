# Dau TOEIC Listening Integration Plan

## Goal

Build the listening module around Dau TOEIC public data while keeping learner state inside ENGLISHGO.

- Fetch Dau TOEIC data for TOEIC Listening Parts 1-4.
- Show a level dashboard grouped by difficulty levels 1-5.
- Add a practice screen for each part and level.
- Support Normal, Bilingual, Fill-word, and Flip-word learning modes.
- Apply the selected assist percentage to both Fill-word and Flip-word.
- Store progress, notes, vocabulary basket, favorites, and resets in ENGLISHGO later.

## 1. Dau TOEIC API Data Flow

Primary source for the level dashboard:

```text
POST /rest/v1/rpc/get_practice_stats
body: { "p_part": 1 }
```

Returned data includes:

```text
part
difficulty_level
item_id
item_type
error_rate
total_attempts
wrong_count
```

Dashboard flow:

```text
/listen?part=1
-> ENGLISHGO backend
-> Dau TOEIC Supabase RPC get_practice_stats
-> group by difficulty_level
-> return level cards 1-5
```

Practice flow:

```text
/listen/practice?part=1&level=1
-> ENGLISHGO backend
-> Dau TOEIC Supabase RPC get_practice_stats(part)
-> filter difficulty_level = level
-> fetch matching questions/passages
-> render practice UI
```

## 2. Fetching By Part

### Part 1

```text
item_id = mock_test_questions.id
Fetch audio_url, image_url, options, correct_answer, passage_text, dich_nghia, tu_vung
Render audio + image + A/B/C/D
```

### Part 2

```text
item_id = mock_test_questions.id
Fetch audio_url, question/options/transcript/translation/vocabulary
Render audio + answer choices
Enable Fill-word and Flip-word on listening text/options
```

### Part 3

```text
item_id represents a passage/group
Fetch mock_test_passages
Fetch mock_test_questions by passage_id
Render one audio + grouped questions
```

### Part 4

```text
Same as Part 3
One talk audio + grouped questions
```

## 3. Backend Endpoints

### Level Dashboard

```text
GET /api/dautoeic/difficulty/parts/{part}/levels
```

Example response:

```json
[
  {
    "part": 1,
    "level": 1,
    "title": "Level 1 - Easy",
    "errorRateMin": 0.01,
    "errorRateMax": 0.14,
    "total": 90,
    "done": 0,
    "correct": 0,
    "wrong": 0,
    "remaining": 90
  }
]
```

### Practice Session

```text
GET /api/dautoeic/difficulty/parts/{part}/levels/{level}
```

Example response:

```json
{
  "part": 1,
  "level": 1,
  "items": [
    {
      "id": "...",
      "type": "question",
      "audioUrl": "...",
      "imageUrl": "...",
      "transcript": "...",
      "translation": "...",
      "vocabulary": "...",
      "questions": []
    }
  ]
}
```

Future local-state endpoints:

```text
POST /api/listening/progress
POST /api/listening/notes
POST /api/listening/vocab-basket
POST /api/listening/favorites
POST /api/listening/reset
```

## 4. ENGLISHGO Database Tables For Later Phases

Do not use Dau TOEIC user-progress tables. Store learner state locally.

```text
listening_progress
- id
- user_id
- source
- part
- level
- item_id
- question_id
- selected_answer
- correct_answer
- is_correct
- mode_used
- assist_percent
- replay_count
- completed_at
```

```text
listening_notes
- id
- user_id
- item_id
- question_id
- note
- created_at
```

```text
listening_favorites
- id
- user_id
- item_id
- question_id
```

```text
vocab_basket
- id
- user_id
- word
- meaning
- example
- source_item_id
```

```text
listening_settings
- id
- user_id
- default_mode
- default_assist_percent
- auto_play
- show_bilingual
```

## 5. UI Flow

### `/listen`

Sidebar:

```text
Part 1: Images
Part 2: Question - Response
Part 3: Conversations
Part 4: Talks
Dictation later
```

Main:

```text
Part header
5 level cards
Progress bar
Correct / wrong / remaining counters
Practice now button
```

Clicking Practice now opens:

```text
/listen/practice?part=1&level=1
```

### Practice Screen

Top bar:

```text
Exit
Part + level title
Bilingual
Notes
Annotator
Fill-word
Flip-word
Assist percent selector
Auto
Correct counter
Question counter
```

Main layout:

```text
Left:
- instruction
- audio player
- rewind controls
- speed control
- image for Part 1
- transcript/translation when enabled

Right:
- question card
- answer options
- Fill-word or Flip-word panel when enabled
```

Bottom:

```text
Report
Vocabulary basket
Previous
Overview
Next
```

## 6. Normal Mode

```text
User listens
-> selects A/B/C/D
-> app checks answer
-> save progress later
-> show correct/wrong state
-> next item
```

For Parts 3 and 4:

```text
One passage has multiple questions
Progress is counted per question_id
Passage is complete when its questions are complete
```

## 7. Bilingual Mode

Bilingual mode is a display toggle only.

```text
Show English transcript
Show Vietnamese translation when available
Show answer translation when available
Show vocabulary when available
```

It should not affect scoring.

## 8. Fill-word Mode By Percentage

Input:

```text
transcript/options text
assist_percent: 10 / 20 / 30 / 50 / 70 / 100
```

Algorithm:

```text
1. Split text into tokens.
2. Ignore punctuation-only tokens.
3. Prefer meaningful words: nouns, verbs, adjectives, adverbs when available.
4. If no NLP exists yet, pick words longer than 3 characters.
5. hidden_count = eligible_word_count * assist_percent.
6. Render blanks as text inputs.
```

Example:

```text
Why is Maria out of the office?
-> Why is Maria out of the _____?
```

Interactions:

```text
Correct input turns green
Focus moves to the next blank
Hint reveals one letter or one word
```

## 9. Flip-word Mode By Percentage

Flip-word uses the same hidden-word selection as Fill-word.

Difference:

```text
Fill-word: learner types the missing word.
Flip-word: learner clicks to reveal the hidden word.
```

UI:

```text
Yellow hidden-word boxes
Flip next word
Flip 3 words
Reveal all
```

Flow:

```text
User listens
-> reads text with some words hidden
-> clicks Flip next word if stuck
-> optionally clicks Flip 3 words or Reveal all
-> still answers the main A/B/C/D question
```

Percentage meaning:

```text
10%: very easy, hide a few words
30%: similar to Dau TOEIC screenshot
50%: medium support
70%: hard
100%: hide all eligible words
```

## 10. Beginner Flow

Recommended presets:

```text
Beginner:
- Level 1
- Bilingual on
- Flip-word 20-30%
- Auto replay on

Training:
- Level 1-2
- Fill-word 30%
- Bilingual optional

Level up:
- Level 2-3
- Fill-word 50%
- Bilingual off

Mock mode:
- Normal
- No transcript
- No flip-word
```

Suggested level-up condition:

```text
accuracy >= 80%
and completed >= 70% of the level
-> suggest the next level
```

## 11. Coding Phases

### Phase 1: Backend Difficulty API

```text
Add level overview DTOs
Call get_practice_stats
Group items by level
Add /levels endpoint
Add /levels/{level} endpoint
```

### Phase 2: Listen Dashboard

```text
Change /listen to show level cards
Keep sidebar parts 1-4
Add Practice now button
```

### Phase 3: Basic Practice Screen

```text
Render Part 1 audio/image/options
Render Part 2 audio/options
Render Part 3/4 grouped questions
Add next/previous links and question counters
```

### Phase 4: Local Progress

```text
Add listening_progress table
Save correct/wrong answers
Show progress on level cards
```

### Phase 5: Bilingual

```text
Toggle transcript
Toggle Vietnamese translation
Show vocabulary
```

### Phase 6: Fill-word And Flip-word By Percentage

```text
Build shared hidden-word engine
Fill-word renders inputs
Flip-word renders reveal boxes
Use the same percentage selector for both modes
```

### Phase 7: Notes, Vocabulary Basket, Favorites, Reset

```text
Add notes
Add vocabulary basket
Add favorites
Add reset level progress
```

### Phase 8: Polish

```text
Keyboard shortcuts
Audio rewind 3s/5s
Auto play
Speed control
Responsive UI
```
