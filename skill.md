# Skill & Context Guide cho AI Coding Agent

> File này cung cấp bối cảnh, quy ước và kỹ năng cần thiết để AI coding agent (Codex 5.5)
> hiểu dự án và sinh code đúng chuẩn. Đọc file này + `workflow.md` TRƯỚC khi bắt đầu bất kỳ task nào.

---

## 1. Bối cảnh dự án

Nền tảng web học tiếng Anh (tương tự luyentu.com): luyện đề TOEIC/IELTS, học từ vựng (flashcard + SRS), theo dõi tiến độ.
Xem chi tiết thiết kế trong `workflow.md`.

**Ưu tiên MVP:** Auth -> Luyện đề (làm bài, chấm điểm, xem đáp án) -> Lịch sử làm bài.

---

## 2. Tech Stack (mặc định)

> Nếu chưa chốt, mặc định dùng Next.js full-stack. Cập nhật khi developer xác nhận.

- **Framework:** Next.js (App Router) + TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma (hỗ trợ soft delete, migration rõ ràng)
- **Auth:** NextAuth (hoặc giải pháp tương đương)
- **Styling:** Tailwind CSS
- **CI/CD:** GitLab CI/CD
- **Media:** S3 / object storage, lưu đường dẫn tương đối + `MEDIA_BASE_URL`

---

## 3. Quy ước code (Coding Conventions)

- **Ngôn ngữ:** TypeScript, bật `strict` mode.
- **Đặt tên:** camelCase cho biến/hàm, PascalCase cho component/type, snake_case cho cột DB.
- **Cấu trúc thư mục (gợi ý):**
  - `app/` - routes & pages (App Router)
  - `app/api/` - API route handlers (REST chuẩn, dùng lại được cho mobile)
  - `components/` - UI components tái sử dụng
  - `lib/` - logic dùng chung (db client, auth, utils)
  - `prisma/` - schema + migrations
  - `types/` - type definitions
- **Error handling:** API trả về format thống nhất `{ success, data, error }`.
- **Validation:** validate input ở API (dùng Zod).
- **Không hardcode secret:** dùng biến môi trường (`.env`).

---

## 4. Quy ước Database (BẮT BUỘC tuân thủ)

1. **Soft delete:** các bảng `tests`, `questions`, `vocab_words`, `vocab_sets`, `lessons` phải có `deleted_at`. Dùng cơ chế ORM, không xóa cứng.
2. **Question grouping:** passage/audio dùng chung qua bảng `question_groups`, `questions.group_id` trỏ về.
3. **Linh hoạt đáp án:** `user_answers` có `selected_option_id` (trắc nghiệm) + `text_response` (điền từ) + `is_correct`.
4. **SRS:** `user_vocab_progress` có `interval`, `ease_factor`, `repetitions`, `next_review_at` (thuật toán SM-2).
5. **Auto-save:** lưu nháp vào `draft_answers` (MVP), Redis sau này.
6. **Pagination + filtering** chuẩn cho mọi API danh sách.
7. **Versioning đề thi:** sửa nội dung -> tạo bản mới, không sửa đè (giữ lịch sử làm bài khớp đáp án).

---

## 5. Nguyên tắc làm việc cho Agent

1. **Đọc `workflow.md` và `skill.md` trước** mọi task.
2. **Làm đúng phạm vi task** trong `task.md`, không tự ý mở rộng.
3. **Ưu tiên đơn giản cho MVP** - không over-engineer (không thêm Redis/Queue/microservice trừ khi task yêu cầu).
4. **Code phải chạy được ngay**, không để placeholder.
5. **Viết test** cho logic nghiệp vụ quan trọng (chấm điểm, SRS).
6. **Commit nhỏ, rõ ràng**, theo conventional commits (`feat:`, `fix:`, `docs:`...).
7. Mỗi task xong -> tạo **merge request** về `main`.
