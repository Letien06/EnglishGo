# Workflow & Thiết kế hệ thống - English Learning Web App

> Tài liệu này ghi lại luồng dự án, kiến trúc và lộ trình phát triển của nền tảng học tiếng Anh (tương tự luyentu.com).
> Mục tiêu: làm rõ thiết kế TRƯỚC khi code để hạn chế "đập đi xây lại".

---

## 1. Tổng quan

Nền tảng học tiếng Anh tập trung vào **luyện đề (TOEIC/IELTS) + học từ vựng + theo dõi tiến độ**, có khả năng mở rộng thêm nhiều kỹ năng (Speaking, Writing chấm AI) về sau.

**3 nhóm người dùng:**
- **Student** - người học
- **Teacher / Content Creator** - tạo đề, bài học, bộ từ vựng
- **Admin** - quản trị toàn hệ thống

**Triết lý phát triển:** *Make it work -> Make it right -> Make it fast.*
Làm đúng những gì khó sửa sau (cấu trúc database); làm đơn giản những gì dễ thêm sau (Redis, Queue, payment, microservice).

---

## 2. Các nhóm chức năng (Functional Modules)

### 2.1. Auth & User
- Đăng ký / đăng nhập (email, Google, Facebook)
- Quên / đổi mật khẩu, xác thực email
- Hồ sơ: avatar, mục tiêu điểm, trình độ
- Phân quyền theo vai trò (Student / Teacher / Admin)
- Gói thành viên (Free / Premium)

### 2.2. Vocabulary (Từ vựng)
- Bộ từ theo chủ đề / trình độ
- Flashcard (nghĩa, phát âm, ví dụ)
- Ôn tập theo thuật toán lặp lại ngắt quãng (SRS - SM-2)
- Kiểm tra từ vựng (trắc nghiệm, điền từ, nghe chép)
- Đánh dấu từ đã thuộc / cần ôn

### 2.3. Practice & Tests (Luyện đề) - LÕI HỆ THỐNG
- Ngân hàng đề thi (TOEIC/IELTS/theo chủ đề)
- Làm bài theo từng part hoặc full test có đếm giờ
- Nhiều dạng câu hỏi: trắc nghiệm, nghe (audio), đọc hiểu (passage), điền từ
- Nộp bài, chấm điểm tự động
- Xem lại đáp án + giải thích (transcript, dịch nghĩa)
- Lưu lịch sử làm bài
- **Auto-save** quá trình làm bài (tránh mất dữ liệu khi rớt mạng/reload)

### 2.4. Lessons (Ngữ pháp / lý thuyết)
- Bài học theo chủ điểm
- Video/bài viết kèm bài tập áp dụng

### 2.5. Progress & Analytics (Tiến độ)
- Dashboard: số từ đã học, số đề đã làm, điểm trung bình
- Biểu đồ tiến bộ theo thời gian
- Điểm mạnh/yếu theo kỹ năng (Listening/Reading)
- Streak (chuỗi ngày học), nhắc nhở

### 2.6. Content Management (cho Teacher/Admin)
- CRUD đề thi, câu hỏi, bộ từ vựng, bài học
- Upload audio/hình ảnh
- Phân loại theo tag, độ khó, chủ đề

### 2.7. Community (tùy chọn, phát triển sau)
- Bình luận, hỏi đáp
- Leaderboard
- Diễn đàn / nhóm học

---

## 3. Thiết kế Database (các bảng chính)

> Đã tích hợp các best practice: soft delete, nhóm câu hỏi, SRS, lưu nháp.

### 3.1. User & Auth
- `users` (id, email, password_hash, role, level, target_score, created_at)
- `subscriptions` (id, user_id, plan_id, start_date, end_date, status) *- thiết kế sẵn, tích hợp payment ở giai đoạn sau*
- `transactions` (id, user_id, amount, provider, status, created_at) *- để dành*

### 3.2. Tests & Questions
- `tests` (id, title, type, duration, difficulty, version, created_by, deleted_at)
- `question_groups` (id, test_id, passage_text, audio_url, image_url) *- gom passage/audio dùng chung cho nhiều câu hỏi (TOEIC Part 3,4,6,7)*
- `questions` (id, test_id, group_id, part, type, content, audio_url, image_url, explanation, deleted_at)
- `answer_options` (id, question_id, content, is_correct)
- `accepted_answers` (id, question_id, answer_text, case_sensitive) *- cho dạng điền từ, hỗ trợ nhiều đáp án đúng*

### 3.3. Làm bài & kết quả
- `user_attempts` (id, user_id, test_id, score, started_at, submitted_at)
- `user_answers` (id, attempt_id, question_id, selected_option_id, text_response, is_correct) *- text_response cho câu điền từ/tự luận ngắn*
- `draft_answers` (id, user_id, test_id, payload, updated_at) *- lưu nháp auto-save (MVP: DB; sau này: Redis)*

### 3.4. Từ vựng & SRS
- `vocab_sets` (id, title, topic, level, deleted_at)
- `vocab_words` (id, set_id, word, meaning, phonetic, example, audio_url, deleted_at)
- `user_vocab_progress` (id, user_id, word_id, status, interval, ease_factor, repetitions, next_review_at) *- thông số chuẩn thuật toán SM-2*

### 3.5. Lessons
- `lessons` (id, title, topic, content, video_url, deleted_at)

**Quy ước database:**
- Soft delete: dùng `deleted_at` (qua cơ chế ORM, tránh quên filter).
- Versioning đề thi: sửa nội dung -> tạo bản mới, giữ lịch sử làm bài cũ khớp đáp án tại thời điểm làm.
- Media: lưu **đường dẫn tương đối** trong DB, ghép với biến môi trường `MEDIA_BASE_URL` ở frontend (dễ đổi CDN/server).
- API: chuẩn hóa **pagination + filtering** ngay từ đầu.

---

## 4. Tech Stack

> Chốt sau khi xác nhận trình độ lập trình của developer:
> - Người mới từ 0 -> **Next.js full-stack + PostgreSQL + Prisma** (học 1 ngôn ngữ, ra MVP nhanh; vẫn xuất REST API dùng lại được cho mobile sau này).
> - Đã vững Java/Java Web -> **Spring Boot** (backend) + Thymeleaf/React.
> - Đã vững C# -> **ASP.NET Core** (backend) + Razor/Blazor/React.

- **CI/CD:** GitLab CI/CD
- **Database:** PostgreSQL (+ Redis cache/session khi cần)
- **Media storage:** S3 / object storage

*(Cập nhật stack chính thức tại đây khi đã chốt.)*

---

## 5. Lộ trình phát triển (làm MVP trước)

### Giai đoạn 1 - MVP
- Auth (đăng ký/đăng nhập, phân quyền)
- Luyện đề: hiển thị câu hỏi -> làm bài -> chấm điểm tự động -> xem đáp án
- Lịch sử làm bài
- Auto-save (localStorage + API ghi định kỳ vào `draft_answers`)

### Giai đoạn 2
- Học từ vựng + Flashcard + SRS
- Dashboard tiến độ
- Tích hợp cổng thanh toán (VNPay/MoMo/PayPal)

### Giai đoạn 3
- CMS cho giáo viên
- Ngữ pháp / bài học

### Giai đoạn 4
- Cộng đồng, leaderboard
- Kỹ năng nâng cao: Speaking/Writing chấm AI (dùng Job Queue xử lý ngầm)

---

## 6. Nguyên tắc quan trọng

1. **Làm đúng cái khó sửa sau** (database schema) ngay từ đầu.
2. **Làm đơn giản cái dễ thêm sau** (Redis, Queue, payment, microservice) - để dành.
3. **Chọn một, đi đến cùng** - không nhảy qua lại giữa các công nghệ.
4. **Bắt đầu nhỏ** - làm tính năng "hiển thị 1 câu hỏi + chấm đúng/sai" trước.
