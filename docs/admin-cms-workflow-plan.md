# Admin CMS, AI Generation, Import, and Learner Rendering Plan

## 1. Mục tiêu

Xây dựng một hệ thống admin hoàn chỉnh để quản lý nội dung học TOEIC miễn phí cho ENGLISHGO:

- Admin CRUD được nội dung Nghe, Đọc, Từ vựng, Đề thi.
- Admin có thể tạo nội dung bằng AI theo format TOEIC-style, không copy đề thật.
- Admin có thể import nội dung từ file PDF/CSV/Excel/audio/image, nhưng luôn qua bước preview và review.
- User-facing pages chỉ render nội dung đã `PUBLISHED`.
- Mọi nội dung có metadata nguồn, trạng thái duyệt, người tạo, người duyệt và log thay đổi.

Hiện trạng code:

- `/teacher/cms` đã có form tạo test/question/vocab/lesson cơ bản.
- Dữ liệu learner đang đọc trực tiếp từ bảng chính: `tests`, `questions`, `answer_options`, `accepted_answers`, `question_groups`, `vocab_sets`, `vocab_words`, `lessons`.
- Chưa có trạng thái draft/review/publish, chưa có import batch, chưa có media manager, chưa có AI generation job.

## 2. Nguyên tắc nghiệp vụ

1. Không publish trực tiếp nội dung từ AI/PDF/import vào learner pages.
2. Tất cả nội dung mới đi qua pipeline:
   `Draft -> Pending Review -> Published / Rejected / Archived`.
3. Nội dung thủ công do admin nhập có thể lưu draft hoặc gửi duyệt; nếu user role là `ADMIN` có thể publish ngay, nhưng vẫn phải tạo audit log.
4. Nội dung AI chỉ được publish sau khi admin xem, sửa, xác nhận.
5. Nội dung import từ PDF chỉ được dùng khi admin xác nhận có quyền sử dụng hoặc tự tạo nội dung mới từ PDF tham khảo hợp pháp.
6. User chỉ thấy nội dung `PUBLISHED`.
7. Không có paywall, không có gói trả phí. Các field như premium/pro chỉ là legacy và không dùng làm điều kiện truy cập.

## 3. Role và quyền

### STUDENT

- Học nội dung đã publish.
- Làm bài, lưu tiến độ, lưu từ vựng cá nhân.

### TEACHER

- Tạo draft nội dung.
- Import file để tạo draft.
- Gửi nội dung lên queue review.
- Không tự publish nếu không được nâng quyền.

### ADMIN

- Toàn quyền CRUD.
- Duyệt/reject/publish/archive.
- Chạy AI generator.
- Quản lý media.
- Xem audit log và import/generation jobs.

## 4. Route admin đề xuất

### Dashboard

- `GET /admin`
  - Tổng quan: số test, câu hỏi, media, draft chờ duyệt, nội dung publish, lỗi import.

### Module Nghe

- `GET /admin/listening`
- `GET /admin/listening/new`
- `GET /admin/listening/{id}/edit`
- `POST /admin/listening`
- `POST /admin/listening/{id}`
- `POST /admin/listening/{id}/publish`
- `POST /admin/listening/{id}/archive`
- Nội dung quản lý:
  - Part 1: image + question/options/audio nếu có.
  - Part 2: audio/transcript + options.
  - Part 3/4: group audio/transcript + nhiều câu hỏi.
  - Dictation: audio + accepted answers.

### Module Đọc

- `GET /admin/reading`
- `GET /admin/reading/new`
- `GET /admin/reading/{id}/edit`
- Nội dung quản lý:
  - Grammar topic.
  - Part 5 standalone question.
  - Part 6 passage group + questions.
  - Part 7 passage/email/ad/article + questions.
  - Bilingual text nếu cần.

### Module Đề thi

- `GET /admin/mock-test`
- `GET /admin/mock-test/new`
- `GET /admin/mock-test/{id}/edit`
- Nội dung quản lý:
  - Test title, source label, duration, version.
  - Sections/parts.
  - Question groups.
  - Questions/options/explanations.
  - Publish whole test only khi đủ cấu trúc tối thiểu.

### Module Từ vựng

- `GET /admin/vocabulary`
- CRUD vocab set và vocab word.
- Import CSV/Excel từ vựng.
- AI generate word examples.

### AI Generator

- `GET /admin/generate`
- `POST /admin/generate`
- `GET /admin/generation-jobs/{id}`
- Tạo draft theo:
  - Skill: Listening / Reading / Mock Test / Vocabulary.
  - Part: 1-7 hoặc vocab topic.
  - Difficulty: easy/medium/hard.
  - Count.
  - Topic/source constraints.

### Import

- `GET /admin/import`
- `POST /admin/import`
- `GET /admin/import-batches/{id}`
- `POST /admin/import-batches/{id}/create-drafts`
- Hỗ trợ theo thứ tự:
  - CSV/Excel structured import trước.
  - PDF text extraction sau.
  - Audio/image upload gắn vào media assets.

### Review Queue

- `GET /admin/content-review`
- `GET /admin/content-review/{id}`
- `POST /admin/content-review/{id}/approve`
- `POST /admin/content-review/{id}/reject`
- `POST /admin/content-review/{id}/publish`

## 5. Data model cần thêm/mở rộng

### Mở rộng bảng chính

Thêm vào các bảng published chính: `tests`, `questions`, `question_groups`, `vocab_sets`, `vocab_words`, `lessons`.

Các cột đề xuất:

- `status`: `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `REJECTED`, `ARCHIVED`.
- `source_type`: `MANUAL`, `AI_GENERATED`, `PDF_IMPORT`, `CSV_IMPORT`, `COMMUNITY`.
- `source_note`: mô tả nguồn.
- `license_note`: ghi chú quyền sử dụng.
- `created_by`.
- `reviewed_by`.
- `reviewed_at`.
- `published_at`.
- `updated_at`.

User-facing query phải filter:

- `status = 'PUBLISHED'`
- `deleted_at IS NULL`

### Bảng mới

#### `media_assets`

Lưu file upload/audio/image/pdf.

- `id`
- `file_name`
- `content_type`
- `storage_path`
- `public_url`
- `size_bytes`
- `duration_seconds`
- `uploaded_by`
- `created_at`

#### `content_import_batches`

Theo dõi mỗi lần import.

- `id`
- `module`: `LISTENING`, `READING`, `VOCABULARY`, `MOCK_TEST`
- `source_type`: `PDF_IMPORT`, `CSV_IMPORT`, `EXCEL_IMPORT`
- `file_asset_id`
- `status`: `UPLOADED`, `PARSED`, `HAS_ERRORS`, `DRAFTED`, `CANCELLED`
- `error_report_json`
- `created_by`
- `created_at`

#### `content_generation_jobs`

Theo dõi job AI.

- `id`
- `module`
- `part`
- `topic`
- `difficulty`
- `count`
- `prompt_version`
- `status`: `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`
- `request_json`
- `result_json`
- `error_message`
- `created_by`
- `created_at`

#### `content_review_items`

Queue duyệt nội dung trước khi publish.

- `id`
- `module`
- `source_type`
- `payload_json`
- `status`: `PENDING`, `APPROVED`, `REJECTED`, `PUBLISHED`
- `review_note`
- `created_by`
- `reviewed_by`
- `reviewed_at`

#### `content_audit_logs`

Audit thay đổi.

- `id`
- `entity_type`
- `entity_id`
- `action`: `CREATE`, `UPDATE`, `DELETE`, `APPROVE`, `REJECT`, `PUBLISH`, `ARCHIVE`
- `actor_id`
- `before_json`
- `after_json`
- `created_at`

## 6. Luồng tạo nội dung thủ công

1. Admin vào module, ví dụ `/admin/listening`.
2. Bấm `Tạo mới`.
3. Nhập metadata:
   - Part, topic, difficulty, tags.
   - Source/license note.
4. Nhập nội dung:
   - Group passage/audio/image nếu cần.
   - Question content.
   - Options.
   - Correct answer.
   - Explanation.
5. Bấm `Lưu nháp`.
6. Admin preview giống learner view.
7. Bấm `Publish`.
8. Learner page nhận dữ liệu ở lần tải tiếp theo.

Validation tối thiểu:

- Multiple-choice phải có 4 options và đúng 1 correct option.
- Dictation/text answer phải có ít nhất 1 accepted answer.
- Listening Part 2-4 phải có audio hoặc transcript.
- Reading Part 6/7 phải có passage/group.
- Mock test không publish nếu không có question.

## 7. Luồng AI generate

1. Admin vào `/admin/generate`.
2. Chọn:
   - Module: Listening / Reading / Mock Test / Vocabulary.
   - Part.
   - Difficulty.
   - Topic.
   - Count.
   - Prompt template version.
3. Backend tạo `content_generation_jobs`.
4. `ContentGenerationService` gọi AI provider.
5. Kết quả phải validate JSON schema:
   - `question`
   - `options`
   - `correctAnswer`
   - `explanation`
   - `passage/transcript/audioScript` nếu cần.
6. Nếu valid, tạo `content_review_items`.
7. Admin xem từng item, sửa nội dung nếu cần.
8. Admin approve/publish.

Guardrail AI:

- Prompt luôn yêu cầu “TOEIC-style original content”.
- Không yêu cầu mô phỏng lại đề thật, sách thật, hay website cụ thể.
- Không đưa text bản quyền từ PDF/web không có quyền vào prompt để biến đổi.
- AI result phải có `source_type = AI_GENERATED`.

## 8. Luồng import PDF/CSV/Excel

### CSV/Excel

1. Admin tải file mẫu.
2. Upload file.
3. Backend parse theo schema cột:
   - `module`, `part`, `group_key`, `question`, `option_a`, `option_b`, `option_c`, `option_d`, `correct`, `explanation`, `audio_url`, `image_url`.
4. Hiển thị preview.
5. Nếu lỗi, báo lỗi theo dòng.
6. Admin bấm `Create review drafts`.
7. Draft vào `content_review_items`.

### PDF

1. Admin upload PDF.
2. Backend extract text.
3. Admin chọn mục đích:
   - `Extract only`: chỉ lấy text để admin tự nhập.
   - `Generate TOEIC-style from topic`: AI tạo câu hỏi mới từ chủ đề hợp pháp.
4. Không publish trực tiếp từ PDF.
5. Tất cả đi qua review queue.

## 9. Cách learner pages render dữ liệu admin

### `/listen`

Hiện tại đang render mock/static part layout. Cần đổi sang:

- Sidebar vẫn có Part 1-4, Dictation.
- Main content query `questions` theo:
  - `status = PUBLISHED`
  - `part = selectedPart`
  - `type` phù hợp.
- Nếu user chưa login, hiển thị lock/CTA như hiện tại.
- Nếu login, cho làm bài theo độ khó.

### `/read`

Render từ `questions/question_groups`:

- Grammar topic từ tag/topic.
- Part 5 standalone.
- Part 6/7 group passage.
- Bilingual có thể lấy từ `question_groups.passage_text` + optional translated text sau này.

### `/mock-test`

Render từ `tests`:

- Chỉ test `PUBLISHED`.
- Card test lấy title/duration/question count/version/source label.
- Vào `/tests/{id}/practice` dùng `PracticeQueryService`.
- `PracticeQueryService.findTests` phải filter status published.

### `/vocab`

Render từ `vocab_sets/vocab_words`:

- Chỉ set/word `PUBLISHED`.
- Admin tạo hoặc import vocab đều vào review/publish.

## 10. Thứ tự triển khai đề xuất

### Task 1: Chuẩn hóa route admin và layout

- Tạo `/admin`.
- Tạo layout admin riêng.
- Menu:
  - Tổng quan
  - Nghe
  - Đọc
  - Từ vựng
  - Đề thi
  - Import
  - AI Generate
  - Review Queue
- Giữ `/teacher/cms` redirect sang `/admin` hoặc để legacy.

### Task 2: Content status + filter learner

- Migration thêm `status/source/review` vào bảng chính.
- Seed cũ set `PUBLISHED`.
- Learner services filter `PUBLISHED`.
- Đây là nền móng quan trọng nhất trước khi AI/import.

### Task 3: CRUD thủ công cho Đề thi

- `/admin/mock-test`: list/create/edit/delete/archive/publish.
- CRUD question group/question/option/accepted answer.
- Preview learner view.

### Task 4: CRUD thủ công cho Nghe và Đọc

- Dùng cùng bảng `questions`, nhưng UI tách theo skill/part.
- Listening ưu tiên Part 1-4 + dictation.
- Reading ưu tiên grammar + Part 5-7.

### Task 5: CRUD Từ vựng

- Set/word CRUD.
- Import CSV đơn giản.
- Publish/filter trên learner `/vocab`.

### Task 6: Review queue + audit log

- Tạo `content_review_items`, `content_audit_logs`.
- Publish từ review queue vào bảng chính.
- Mọi thao tác publish/reject/archive ghi audit.

### Task 7: CSV/Excel import

- Upload + parse + preview + error report.
- Tạo review items, không publish trực tiếp.

### Task 8: PDF import

- Upload PDF.
- Extract text.
- Preview text.
- Cho admin tạo draft thủ công hoặc gọi AI generate TOEIC-style từ topic/text hợp pháp.

### Task 9: AI generator

- Tạo `content_generation_jobs`.
- Prompt templates theo part.
- JSON schema validation.
- Kết quả vào review queue.

### Task 10: Polish và test

- Tests cho CRUD service, publish service, import parser, generation validator.
- Smoke test các route:
  - `/admin`
  - `/admin/mock-test`
  - `/admin/listening`
  - `/admin/reading`
  - `/admin/content-review`
  - `/listen`
  - `/read`
  - `/mock-test`

## 11. Definition of Done

Phần admin được xem là hoàn chỉnh khi:

- Admin tạo/sửa/xóa/archive/publish được nội dung nghe, đọc, đề thi, từ vựng.
- User-facing pages chỉ hiển thị nội dung published.
- AI tạo được draft TOEIC-style và phải qua review.
- Import CSV/PDF tạo được draft và phải qua review.
- Có audit log cho publish/reject/update.
- Không có nội dung trả phí/paywall.
- `mvn test` pass.

## 12. Trạng thái triển khai hiện tại

Đã triển khai trong code:

- `/admin`: dashboard số lượng nội dung và workflow.
- `/admin/listening`: CRUD nền cho câu hỏi nghe.
- `/admin/reading`: CRUD nền cho bài đọc/bài học và câu hỏi đọc.
- `/admin/vocabulary`: CRUD nền cho bộ từ và từng từ.
- `/admin/mock-test`: CRUD nền cho đề thi và câu hỏi đề.
- `/admin/generate`: tạo câu hỏi TOEIC-style dạng draft vào `PENDING_REVIEW`.
- `/admin/import`: import CSV/PDF/TXT vào draft/review queue.
- `/admin/content-review`: duyệt publish/archive cho test, question, lesson, vocab set, vocab word.
- User-facing query chỉ lấy `PUBLISHED`.
- `/lessons/**` được mở public để nội dung bài đọc miễn phí render cho user.
- `/listen` đã render câu hỏi `PUBLISHED` theo Part 1-4/Dictation từ dữ liệu admin, kèm audio/image/options và link vào đề luyện.
- `/read` đã render lesson và câu hỏi `PUBLISHED` theo Grammar/Part 5/6/7/Song ngữ từ dữ liệu admin.
- Spring response đã ép `charset=UTF-8` để tránh lỗi tiếng Việt bị mojibake trên trình duyệt.
- `ADMIN_EMAILS` trong `.env` dùng để cấp role ADMIN khi đăng nhập Firebase.
- `/admin/users` đã có màn quản lý người dùng để admin đổi role `STUDENT`, `TEACHER`, `ADMIN` trực tiếp trong hệ thống.
- Admin UI đã dùng tab chung, action button phân màu theo nghiệp vụ và ẩn các action trùng trạng thái như publish nội dung đã published.

Giới hạn cố ý của bản hiện tại:

- AI generate hiện là TOEIC-style template generator nội bộ, chưa gọi OpenAI/LLM thật. Có thể thay service `AdminContentGenerationService` bằng provider thật sau khi có API key.
- PDF/TXT import ưu tiên tạo bài đọc hoặc danh sách từ để admin review. Nếu muốn import câu hỏi đầy đủ, dùng CSV có cấu trúc.

CSV câu hỏi hỗ trợ header:

```csv
part,type,content,option_a,option_b,option_c,option_d,correct_option,explanation,audio_url,image_url
5,MULTIPLE_CHOICE,"The manager asked the team to submit the report ____ Friday.",by,at,on,from,A,"By means no later than a deadline.",,
```

CSV từ vựng hỗ trợ header:

```csv
word,meaning,phonetic,example,audio_url
contract,hợp đồng,/ˈkɑːntrækt/,"The contract is ready.",
```
