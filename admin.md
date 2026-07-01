# ENGLISHGO Admin Core, Question Bank & Learning Content

## Mục Tiêu

Xây dựng Admin theo đúng nghiệp vụ học TOEIC miễn phí:

- Admin quản lý ngân hàng câu hỏi Nghe/Đọc, nhóm câu hỏi, media, publish workflow, ghép đề thi và phân quyền.
- User chỉ nhìn thấy dữ liệu `PUBLISHED`.
- Question Bank độc lập với Test. Đề thi full test được ghép từ các câu hỏi đã publish.
- Không có paywall, nâng cấp, gói Pro hoặc bán khóa học.
- AI generator chỉ tạo nội dung TOEIC-style để admin duyệt, không copy đề thật.

## Trạng Thái Triển Khai

Đã làm:

- Migration `V7__question_bank_core.sql` cho Question Bank, groups, media.
- Migration `V8__test_question_assembly.sql` cho bảng nối `test_questions`.
- Entity/enum core: `SkillType`, `ToeicPart`, `MediaType`, `MediaAsset`, `TestQuestion`.
- Update `Question`, `QuestionGroup`, `AnswerOption`.
- DTO request/response cho question, group, answer, media.
- Local media storage và public route `/media/**`.
- Service:
  - `QuestionBankService`
  - `QuestionGroupService`
  - `QuestionPublishValidator`
  - `MediaStorageService`
  - `AdminContentGenerationService`
  - `AdminContentImportService`
  - `AdminTestAssemblyService`
  - `VocabService` SM-2 review flow
- Controller:
  - `AdminQuestionController`
  - `AdminQuestionGroupController`
  - `AdminMediaController`
  - `AdminAutomationController`
  - `UserQuestionController`
  - `VocabularyController`
- Admin shell riêng, không dùng learner sidebar.
- UI:
  - `/admin`
  - `/admin/question-bank`
  - `/admin/question-bank/new`
  - `/admin/question-groups`
  - `/admin/media`
  - `/admin/users`
  - `/admin/ai-import`
  - `/admin/test-assembly`
- `/listen`, `/read`, `/api/questions` đọc câu hỏi `PUBLISHED` từ Question Bank.
- `/mock-test` đọc câu hỏi từ bảng nối `test_questions`, có fallback legacy theo `test_id`.
- `/vocab/review` mở phiên ôn tập các từ đến hạn theo SM-2.
- `/vocab/sets/{id}` hiển thị chi tiết bộ từ, danh sách từ, tiến độ thuộc và thêm từ bằng Gemini.
- Header user đã bỏ Video, More, Nâng cấp.
- `mvn test` pass.

## Admin Navigation

Admin sidebar chỉ gồm:

- Tổng quan
- Ngân hàng câu hỏi
- Nhóm câu hỏi
- Media
- AI & Import
- Ghép đề thi
- Duyệt xuất bản
- Người dùng
- Về trang học
- Đăng xuất

Không hiển thị learner menu trong admin:

- Hub
- Practice
- Vocabulary
- Lessons
- History
- Community
- Writing
- Account
- Admin CMS dạng cũ

Các route learner như `/listen`, `/read`, `/vocab`, `/mock-test` vẫn giữ cho user.

## Database Core

### `questions`

Question Bank độc lập với đề thi:

- `test_id` nullable
- `group_id` nullable
- `part INT`
- `skill_type`: `LISTENING`, `READING`
- `difficulty_level`: 1 đến 5
- `content`
- `audio_url`
- `image_url`
- `explanation`
- `status`: `DRAFT`, `PUBLISHED`
- audit fields: `created_at`, `updated_at`, `published_at`, `deleted_at`

### `question_groups`

Dùng cho nội dung cha:

- Listening Part 3/4: audio chung.
- Reading Part 6/7: passage HTML chung.

Fields chính:

- `test_id` nullable
- `skill_type`
- `part`
- `title`
- `passage_html`
- `audio_url`
- `image_url`
- `difficulty_level`
- `status`
- audit fields

### `answer_options`

Giữ bảng hiện tại và dùng như bảng answers:

- `question_id`
- `content`
- `is_correct`
- `created_at`

### `media_assets`

Quản lý file local:

- Audio: `uploads/audio`
- Image: `uploads/images`
- Public URL: `/media/audio/...` hoặc `/media/images/...`

### `test_questions`

Ghép full test từ Question Bank:

- `test_id`
- `question_id`
- `display_order`
- unique `(test_id, question_id)`

## Publish Validation

Common:

- `content` không rỗng.
- `difficulty_level` từ 1 đến 5.
- Có ít nhất một `answer_options.is_correct = true`.

Listening:

- Part 1 cần `audio_url` và `image_url`.
- Part 2 cần `audio_url`.
- Part 3/4 cần `group_id`, group cùng skill/part và group có `audio_url`.

Reading:

- Part 5 không bắt buộc group.
- Part 6/7 cần `group_id`, group cùng skill/part và group có `passage_html`.

Group publish:

- Listening Part 3/4 cần `audio_url`.
- Reading Part 6/7 cần `passage_html`.

## AI Generator & Import

### `/admin/ai-import`

AI generator hiện tại là generator nội bộ dạng synthetic TOEIC-style:

- Tạo câu hỏi vào Question Bank.
- Mặc định `DRAFT`.
- Gắn `source_type = AI_GENERATED`.
- Gắn note rõ là nội dung mô phỏng, không copy đề thật.
- Admin phải duyệt và publish trước khi user thấy.

Import:

- CSV câu hỏi tạo trực tiếp vào Question Bank dạng `DRAFT`.
- CSV từ vựng tạo vocab set/word dạng chờ duyệt.
- PDF/TXT Reading tạo `question_groups` với `passage_html`.
- PDF/TXT Listening tạo group draft để admin bổ sung audio.

CSV câu hỏi khuyến nghị:

```csv
skill_type,part,difficulty_level,content,option_a,option_b,option_c,option_d,correct_option,audio_url,image_url,explanation
READING,5,3,The manager asked...,review,reviewed,reviewing,reviews,B,,,
```

## Ghép Đề Thi

### `/admin/test-assembly`

Luồng:

1. Admin nhập title, duration, difficulty.
2. Chọn số câu Listening và Reading.
3. Hệ thống lấy câu hỏi `PUBLISHED` từ Question Bank.
4. Tạo `tests`.
5. Tạo các dòng `test_questions` theo `display_order`.
6. Nếu test là `PUBLISHED`, user có thể vào `/mock-test`.

Rule:

- Không ghép câu hỏi `DRAFT`.
- Không copy câu hỏi sang test, chỉ link bằng `test_questions`.
- Nếu chưa có câu hỏi published thì trả lỗi để admin biết cần publish trước.

## Flashcard & SM-2

Module vocab có các chế độ học:

- Flashcard
- Quiz
- Listening
- Typing
- Ghép cặp
- Tổng hợp

SM-2:

- `POST /api/vocab/words/{wordId}/review` nhận quality 0-5.
- Cập nhật `ease_factor`, `interval`, `repetitions`, `next_review_at`.
- `/vocab?tab=progress` hiển thị số từ cần ôn.
- `/vocab/review` mở phiên ôn tập các từ có `next_review_at <= now`.
- Anonymous user bị redirect về login khi mở `/vocab/review`.

## Gemini Vocabulary Assistant

### `/vocab/sets/{id}`

Trang chi tiết bộ từ hiển thị:

- Tổng số từ trong bộ.
- Số từ đã thuộc.
- Số từ chưa thuộc.
- Phần trăm tiến độ.
- Danh sách từ gồm: từ vựng, nghĩa, loại từ, phiên âm, ví dụ, trạng thái thuộc.
- Tìm kiếm và lọc theo trạng thái thuộc/chưa thuộc.
- Nút phát âm bằng audio URL hoặc browser speech synthesis.
- Toggle thuộc gọi lại API review SM-2 với quality `5`.

### Thêm từ với Gemini

Endpoint:

```http
POST /vocab/sets/{id}/ai-words
```

Mode:

- `topic`: nhập chủ đề, ví dụ `workplace communication`.
- `reading`: dán đoạn văn tiếng Anh để Gemini trích xuất từ quan trọng.
- `image`: upload JPG/PNG/WEBP để Gemini đọc chữ trong ảnh và trích xuất từ vựng.

Config:

```properties
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

Rule:

- Không hard-code API key trong repo.
- Nếu thiếu `GEMINI_API_KEY`, form trả lỗi cấu hình rõ ràng.
- Gemini phải trả JSON array gồm `word`, `meaning`, `partOfSpeech`, `phonetic`, `example`.
- Từ được lưu vào `vocab_words` với `source_type = AI_GENERATED` và `status = PUBLISHED`.
- Ảnh chỉ nhận JPG/PNG/WEBP tối đa 5MB.

## User Flow

### `/listen`

Query:

- `skill_type = LISTENING`
- `part = selected`
- `status = PUBLISHED`

Render:

- Part 1: image + audio + answers.
- Part 2: audio + answers.
- Part 3/4: group audio + câu hỏi con.

### `/read`

Query:

- `skill_type = READING`
- `part = selected`
- `status = PUBLISHED`

Render:

- Part 5: text question + answers.
- Part 6/7: passage HTML + câu hỏi con.

### `/api/questions`

Endpoint:

```http
GET /api/questions?skillType=LISTENING&part=PART_1
```

Rule:

- Chỉ trả `PUBLISHED`.
- Không trả draft.
- Không phụ thuộc `tests`.

### `/mock-test`

Rule:

- Đọc danh sách câu hỏi từ `test_questions`.
- Chỉ render câu hỏi `PUBLISHED`.
- Fallback dữ liệu legacy theo `questions.test_id` nếu test cũ chưa có link.

## Definition Of Done

Task này xong khi:

- Admin không còn sidebar learner lẫn lộn.
- Admin có dashboard/question bank/group/media/users/AI import/test assembly.
- Admin tạo được câu hỏi Listening/Reading dạng draft.
- Admin upload được ảnh/audio local và preview được trong form.
- Admin không publish được câu hỏi thiếu đáp án đúng.
- Admin không publish được Part 1 thiếu audio/image.
- CSV/PDF import tạo draft đúng nơi để admin duyệt.
- Ghép đề thi chỉ dùng câu hỏi published.
- `/listen`, `/read`, `/mock-test`, `/api/questions` không trả draft.
- `/vocab/review` dùng SM-2 due queue.
- `mvn test` pass.
