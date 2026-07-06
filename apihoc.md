# Plan tích hợp API học từ vựng Dautoeic

## 1. Kết quả đọc API Dautoeic

Trang `https://dautoeic.com/vocabulary` là React/Vite SPA. Phần từ vựng gọi trực tiếp Supabase public REST/RPC:

- Supabase URL: `https://qfhmnlvgweznzcsoijyr.supabase.co`
- Auth: dùng `apikey`/`Authorization: Bearer <DAUTOEIC_ANON_KEY>` từ env `DAUTOEIC_ANON_KEY`, không hard-code vào client app mình.
- App mình đã có sẵn biến:
  - `DAUTOEIC_SUPABASE_URL`
  - `DAUTOEIC_ANON_KEY`
  - `DAUTOEIC_MEDIA_BASE_URL`

Các bảng/RPC chính quan sát và gọi thử được:

| Loại | Tên | Mục đích |
| --- | --- | --- |
| RPC | `get_vocabulary_catalog` | Lấy danh mục group + bộ từ/test. Đã gọi thử thành công, trả `sets` và `tests`. |
| Table | `vocabulary_sets` | Nhóm ngoài: `600 TỪ VỰNG TOEIC`, `ETS 2023`, `ETS 2024`, `ETS 2026`, `TOEIC MASTER`. |
| Table | `vocabulary_tests` | Card/bộ con trong mỗi nhóm, ví dụ `Contracts`, `Marketing`, `Test 1`. |
| Table | `vocabulary_parts` | Part trong một bộ/test. Bộ 600 từ thường có 1 part `Words`; ETS có nhiều part TOEIC. |
| Table | `vocabulary_words` | Từ vựng theo `part_id`. |
| RPC | `get_vocab_words_for_part_fast` | Lấy words của một part. |
| RPC | `get_vocab_words_for_parts_fast` | Lấy words nhiều part. |
| RPC | `get_vocabulary_word_counts_by_part` | Count words theo part. |
| RPC | `get_user_learned_counts_by_test` | Dautoeic đếm số từ user đã học theo test. App mình không dùng trực tiếp vì user hệ mình khác user Dautoeic. |
| RPC | `get_user_due_counts_by_test` | Dautoeic đếm số từ cần ôn theo test. App mình tự tính trong Firestore. |
| Table | `user_vocabulary` | Progress Dautoeic. Không dùng trực tiếp cho app mình vì auth/user khác hệ. |

Mẫu catalog đã gọi thử:

- `600 TỪ VỰNG TOEIC`: các test như `Contracts` 12 từ, `Marketing` 12 từ.
- `ETS 2023`: `Test 1` 351 từ, `Test 2` 394 từ.
- `ETS 2024`, `ETS 2026`: các test 160 từ.
- `TOEIC MASTER`: các bộ theo part/chủ đề, có `access_level` `free` hoặc `pro`.

Mẫu word từ `Contracts`:

```json
{
  "id": "9e06885a-63fb-4b04-90f6-cb7471c80748",
  "part_id": "e03c9235-02ac-460c-bd33-8cc0846466c9",
  "word": "abide by",
  "ipa": "UK: /.../ | US: /.../",
  "audio_us": "https://.../abide-by-us-v2.mp3",
  "audio_uk": "https://.../abide-by-uk-v2.mp3",
  "meanings": [
    {
      "pos": "verb",
      "meaning": "tuân theo",
      "example": "All employees must abide by company safety regulations..."
    }
  ],
  "phrases": [],
  "synonyms": [],
  "order_index": 1,
  "difficulty_level": 1
}
```

## 2. Nguyên tắc tích hợp vào app mình

App hiện tại đã có sẵn phần từ vựng trong Next.js:

- Trang chính: `web/src/app/(app)/vocab/page.tsx`
- Chi tiết bộ từ: `web/src/app/(app)/vocab/[setId]/page.tsx`
- Game học: `web/src/app/(app)/vocab/[setId]/flashcards/FlashcardGame.tsx`
- Service: `web/src/lib/services/vocab.ts`
- Progress: `users/{uid}/userVocabProgress/{wordId}`
- Review endpoint hiện tại: `/api/vocab/words/{wordId}/review`

Vì game và progress hiện tại đang dùng `wordId` số và đọc word từ Firestore, không nên chỉ trả word Dautoeic dạng UUID trực tiếp cho game. Cách ít phá code nhất:

1. Tạo adapter gọi Dautoeic API.
2. Khi user mở hoặc sync một bộ Dautoeic, mirror metadata tối thiểu vào Firestore:
   - `vocabSets`: một document đại diện cho Dautoeic test/card.
   - `vocabWords`: các word trong bộ/part, dùng numeric id ổn định sinh từ UUID ngoài.
3. Game hiện tại tiếp tục dùng `VocabSetSession` và `/api/vocab/words/{wordId}/review`.
4. Progress, due words, mastered count, thanh tiến độ ngoài card đều dùng Firestore của app mình, không phụ thuộc user Dautoeic.

## 3. Data mapping đề xuất

### 3.1. Stable ID

Vì Dautoeic dùng UUID string, app mình dùng number:

- `setId = stableNumericId("dautoeic:vocab_test:" + test_id)`
- `wordId = stableNumericId("dautoeic:vocab_word:" + word_id)`
- `partId` giữ dạng string trong metadata phụ.

Hàm `stableNumericId` nên dùng hash 53-bit hoặc CRC32 có namespace và check collision khi upsert.

### 3.2. `vocabSets`

Map `vocabulary_tests` sang `VocabSetDoc`:

| App mình | Dautoeic |
| --- | --- |
| `id` | stable id từ `test_id` |
| `title` | `test.name` |
| `topic` | parent set name, ví dụ `ETS 2023` |
| `description` | `Dautoeic vocabulary test_id=<uuid>` |
| `icon` | mặc định `book`/`📘` theo UI hiện có |
| `level` | `access_level` hoặc `part_count` |
| `status` | `PUBLISHED` |
| `sourceType` | thêm enum `DAUTOEIC` hoặc dùng `IMPORT` + `sourceNote` |
| `sourceNote` | `dautoeic:vocabulary_tests:<test_id>` |
| `licenseNote` | `External public Supabase API; cached for learning integration` |

Nên mở rộng type `SourceType` thành:

```ts
export type SourceType = "MANUAL" | "AI" | "IMPORT" | "COMMUNITY" | "DAUTOEIC";
```

### 3.3. `vocabWords`

Map `vocabulary_words` sang `VocabWordDoc`:

| App mình | Dautoeic |
| --- | --- |
| `id` | stable id từ word UUID |
| `setId` | stable id của test |
| `word` | `word` |
| `meaning` | `meanings[0].meaning` hoặc `definition_vi` |
| `partOfSpeech` | `meanings[0].pos` hoặc `part_of_speech` |
| `phonetic` | `ipa` |
| `phoneticUs` | parse từ `ipa` nếu có `US:` |
| `phoneticUk` | parse từ `ipa` nếu có `UK:` |
| `example` | `meanings[0].example` |
| `audioUrl` | `audio_url` |
| `audioUsUrl` | `audio_us` |
| `audioUkUrl` | `audio_uk` |
| `status` | `PUBLISHED` |
| `sourceType` | `DAUTOEIC` |
| `sourceNote` | `dautoeic:vocabulary_words:<word_id>; part_id=<part_id>` |

Nếu muốn phân loại theo part trong ETS, thêm field phụ không phá UI:

```ts
externalPartId?: string;
externalPartName?: string;
externalOrderIndex?: number;
toeicPart?: number | null;
difficultyLevel?: number | null;
```

## 4. API nội bộ cần thêm

### 4.1. Server service

Tạo `web/src/lib/services/dautoeic-vocab.ts`:

- `getVocabularyCatalog()`
  - POST `/rest/v1/rpc/get_vocabulary_catalog`
  - Return `{ sets, tests }`
- `listVocabularyParts(testId: string)`
  - GET `/rest/v1/vocabulary_parts?select=id,name,order_index&test_id=eq.<testId>&order=order_index.asc`
- `getWordsForPart(partId: string)`
  - POST `/rest/v1/rpc/get_vocab_words_for_part_fast`
- `getWordsForParts(partIds: string[])`
  - POST `/rest/v1/rpc/get_vocab_words_for_parts_fast`
- `syncDautoeicVocabTest(testId: string)`
  - Lấy test trong catalog, parts, words.
  - Upsert `vocabSets` và `vocabWords`.
  - Return internal `setId`, `partSummaries`, `wordCount`.

Dùng helper Supabase giống `web/src/lib/services/dautoeic.ts`: server-only, cache 5-10 phút, có mirror fallback nếu cần.

### 4.2. API routes

Thêm route:

- `GET /api/dautoeic/vocab/catalog`
  - Trả group tabs + test cards đã map.
- `GET /api/dautoeic/vocab/tests/:testId`
  - Trả detail test, parts, counts, progress local nếu có uid.
- `POST /api/dautoeic/vocab/tests/:testId/sync`
  - Sync/mirror test vào Firestore, trả `{ setId }`.
- `GET /api/dautoeic/vocab/tests/:testId/parts/:partId/session`
  - Sync part nếu chưa có, trả `VocabSetSession` hoặc redirect sang internal `/vocab/:setId/flashcards`.

Nếu muốn ít route hơn, có thể chỉ thêm:

- `GET /api/dautoeic/vocab/catalog`
- `POST /api/dautoeic/vocab/tests/:testId/sync`

Sau sync, mọi thứ dùng route `/vocab/:setId/flashcards?mode=menu`.

## 5. Luồng UI theo yêu cầu

### 5.1. Trang ngoài `/vocab`

Giữ các tab hiện tại: `Học`, `Tiến độ`, `Từ vựng của tôi`, `Thuật toán học từ`.

Trong tab `Học`, thay/ghép danh sách bộ gợi ý bằng Dautoeic catalog:

1. Load `getVocabularyCatalog`.
2. Render nhóm dạng pill:
   - `600 TỪ VỰNG TOEIC (50)`
   - `ETS 2023 (10)`
   - `ETS 2024 (10)`
   - `ETS 2026 (10)`
   - `TOEIC MASTER (3)`
3. Mỗi card chỉ có:
   - nhãn group
   - tên bộ/test
   - số từ
   - progress text, ví dụ `1/12 từ đã thuộc`
   - thanh progress mastered
   - badge `PRO` nếu `access_level=pro` nhưng không xây payment/checkout
   - nút duy nhất: `Vào học`

Không cần nút `Xem chi tiết` ở card Dautoeic nếu muốn giống ảnh.

### 5.2. Khi bấm `Vào học`

Luồng phân nhánh:

1. Bộ thường, ví dụ `Contracts`, `Marketing`
   - Có 1 part hoặc part tên `Words`.
   - App sync/mirror test đó.
   - Mở thẳng màn chọn game: `/vocab/{internalSetId}/flashcards?mode=menu`.

2. Bộ ETS, ví dụ `ETS 2023/Test 1`
   - Có nhiều part.
   - Mở màn chọn part trước:
     - Part 1, Part 2, ..., Part 7
     - mỗi part có `wordCount`, `mastered/total`, `dueWords`
   - User chọn part.
   - App sync/mirror words của part đó.
   - Mở màn chọn game cho part đã chọn.

3. TOEIC MASTER
   - Nếu test có nhiều part/chủ đề nhỏ, xử lý như ETS: chọn part trước.
   - Nếu chỉ 1 part, mở thẳng chọn game.

### 5.3. Màn chọn game

Dùng lại `FlashcardGame` hiện có:

- Flashcard
- Trắc nghiệm
- Nối từ với nghĩa
- Gõ từ vựng
- Nghe viết
- Tổng hợp

Điều chỉnh UI trong mode menu:

- Hiển thị tiêu đề bộ: `Contracts` hoặc `ETS 2023 - Test 1 - Part 5`.
- Hiển thị `x/y từ đã thuộc`.
- Hiển thị `Lịch sử học` ngay dưới game cards.
- Bỏ các filter rườm rà nếu user đi từ Dautoeic card; chỉ giữ filter nếu đang ở bộ cá nhân.

## 6. Logic progress và thanh tiến độ

Không dùng progress Dautoeic `user_vocabulary`. App mình tự lưu trong Firestore:

```text
users/{uid}/userVocabProgress/{wordId}
```

Status hiện có:

- `NEW`
- `LEARNING`
- `REVIEWING`
- `MASTERED`

Quy tắc tính ngoài card:

- `totalWords`: số word trong Dautoeic test/part đã sync hoặc `word_count` từ catalog nếu chưa sync.
- `learnedWords`: progress status khác `NEW`.
- `masteredWords`: progress status `MASTERED`.
- `dueWords`: status khác `NEW` và `nextReviewAtMillis <= now`.
- Progress text ngoài card: `${masteredWords}/${totalWords} từ đã thuộc`.
- Thanh progress: `masteredWords / totalWords * 100`.

Khi user hoàn thành game:

- Câu đúng:
  - gọi review với `quality=4` hoặc `5`.
  - nếu đúng nhiều lần, SM-2 tự đưa lên `MASTERED`.
- Câu sai:
  - gọi review với `quality=1` hoặc `2`.
  - status về `LEARNING`, next review ngắn.
- Nút đánh dấu đã thuộc:
  - gọi review `quality=5`.

## 7. Lịch sử học

Hiện `FlashcardGame` đang lưu lịch sử vào `localStorage` key:

```text
englishgo-vocab-history-{setId}
```

Để đáp ứng yêu cầu "có lịch sử học" và đồng bộ theo tài khoản, thêm Firestore:

```text
users/{uid}/vocabStudyHistory/{historyId}
```

Fields:

```ts
{
  id: string;
  source: "DAUTOEIC" | "LOCAL";
  setId: number;
  externalTestId?: string;
  externalPartId?: string;
  title: string;
  mode: "flashcard" | "quiz" | "matching" | "typing" | "listening" | "mixed";
  startedAtMillis: number;
  finishedAtMillis: number;
  totalWords: number;
  correctWords: number;
  wrongWords: number;
  accuracy: number;
  score: number;
}
```

Luồng:

1. Khi user bấm game: tạo session local state.
2. Khi game kết thúc và bấm `Lưu & Hoàn thành`:
   - update progress từng word.
   - ghi `vocabStudyHistory`.
   - invalidate/reload progress cards.
3. Màn chọn game đọc 8 lịch sử gần nhất từ Firestore, fallback localStorage nếu chưa đăng nhập.

## 8. Part logic cho ETS

Dautoeic lưu part bằng `vocabulary_parts`:

- Query parts theo `test_id`.
- Count words theo `part_id`.
- Với ETS, hiển thị bước chọn part trước khi chọn game.

UI part card:

```text
Part 1
45 từ
3/45 từ đã thuộc
2 cần ôn
[Vào học]
```

Quy tắc nhận diện part:

- Nếu `parts.length <= 1`: bỏ qua bước chọn part.
- Nếu `parts.length > 1`: bắt buộc chọn part.
- `toeicPart` parse từ `part.name`, ví dụ `Part 5`, `Part 6`.
- Nếu parse không được thì dùng `part.name` nguyên bản.

## 9. Cache, sync và fallback

Không nên gọi Dautoeic API ở mọi render:

- Cache catalog 10 phút bằng `unstable_cache`.
- Cache parts/words theo `testId/partId` 10 phút.
- Mirror Firestore:
  - Nếu đã có `vocabSets.sourceNote=dautoeic:vocabulary_tests:<testId>` và `updatedAtMillis` còn mới, dùng Firestore.
  - Nếu thiếu hoặc quá hạn, gọi Dautoeic API rồi upsert.
- Nếu Dautoeic API lỗi:
  - Nếu đã mirror: vẫn học được từ cache Firestore.
  - Nếu chưa mirror: card báo `Chưa tải được bộ từ, thử lại`.

## 10. Các bước triển khai đề xuất

### Phase 1: API adapter và sync

1. Thêm type Dautoeic vocab vào `web/src/types/dautoeic.ts`.
2. Tạo `web/src/lib/services/dautoeic-vocab.ts`.
3. Thêm helper stable numeric id.
4. Thêm `SourceType="DAUTOEIC"`.
5. Viết `syncDautoeicVocabTest(testId, partId?)`.
6. Test bằng `Contracts` và `ETS 2023/Test 1`.

### Phase 2: UI catalog ngoài `/vocab`

1. Trong `LearnTab`, gọi Dautoeic catalog thay vì chỉ Firestore sets.
2. Render group pills giống Dautoeic.
3. Card chỉ có `Vào học`.
4. Tính progress local theo internal stable set ids.
5. Hiển thị `x/y từ đã thuộc` và progress bar.

### Phase 3: Part picker cho ETS

1. Tạo route/page `/vocab/dautoeic/[testId]`.
2. Load parts + local progress.
3. Nếu 1 part, auto sync và redirect game menu.
4. Nếu nhiều part, render cards theo part.
5. Bấm part sync words rồi mở game.

### Phase 4: Lịch sử học đồng bộ

1. Thêm service `recordVocabStudyHistory`.
2. Sửa `FlashcardGame` để khi save result gọi API ghi history.
3. Màn game menu đọc history từ Firestore.
4. LocalStorage chỉ còn fallback guest.

### Phase 5: Hoàn thiện progress

1. Sau mỗi review/update history, invalidate:
   - card catalog
   - progress tab
   - part picker
2. Đảm bảo `1/12 từ đã thuộc` đổi ngay sau khi học.
3. Thêm empty/error/loading state.
4. Viết test cho:
   - mapping word meanings/IPA/audio
   - sync id ổn định
   - progress count
   - part picker decision

## 11. Acceptance criteria

- Vào `/vocab` thấy các nhóm Dautoeic như ảnh.
- Card Dautoeic chỉ có nút `Vào học`.
- Card hiển thị đúng số từ và `mastered/total`, ví dụ `1/12 từ đã thuộc`.
- Bấm `Contracts` mở thẳng màn chọn game.
- Bấm `ETS 2023/Test 1` mở màn chọn part trước, rồi mới chọn game.
- Học xong game cập nhật progress Firestore.
- Quay lại `/vocab`, thanh tiến độ ngoài card cập nhật.
- Màn chọn game có lịch sử học gần nhất.
- Nếu Dautoeic API lỗi nhưng data đã mirror, vẫn học được.
- Không copy logo/source UI/asset Dautoeic; chỉ dùng dữ liệu API qua adapter server-side.

