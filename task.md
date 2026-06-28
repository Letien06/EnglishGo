# Task Board - English Learning Web App

> Danh sách task cho AI coding agent (Codex 5.5) thực hiện theo thứ tự.
> Đọc `workflow.md` + `skill.md` trước khi bắt đầu.
> Trạng thái: [ ] chưa làm | [~] đang làm | [x] xong

---

## GIAI ĐOẠN 0 - Khởi tạo dự án (Setup)

- [ ] **T0.1** Khởi tạo project Next.js + TypeScript + Tailwind CSS.
- [ ] **T0.2** Cài đặt Prisma, kết nối PostgreSQL, tạo file `.env.example`.
- [ ] **T0.3** Dựng cấu trúc thư mục (`app/`, `app/api/`, `components/`, `lib/`, `prisma/`, `types/`).
- [ ] **T0.4** Cấu hình ESLint + Prettier + `tsconfig` strict.
- [ ] **T0.5** Tạo file `.gitlab-ci.yml` cơ bản (lint + build + test).

## GIAI ĐOẠN 1 - MVP

### 1A. Database schema
- [ ] **T1.1** Viết Prisma schema cho: `users`, `tests`, `question_groups`, `questions`,
      `answer_options`, `accepted_answers`, `user_attempts`, `user_answers`, `draft_answers`.
      Tuân thủ quy ước DB trong `skill.md` (soft delete, grouping, text_response).
- [ ] **T1.2** Tạo migration + seed dữ liệu mẫu (1 đề TOEIC mini: vài câu trắc nghiệm + 1 nhóm câu hỏi có audio).

### 1B. Auth
- [ ] **T1.3** Đăng ký / đăng nhập bằng email + password (hash bcrypt).
- [ ] **T1.4** Session/JWT + middleware bảo vệ route cần đăng nhập.
- [ ] **T1.5** Phân quyền role (Student / Teacher / Admin).

### 1C. Luyện đề (lõi)
- [ ] **T1.6** API + trang danh sách đề thi (có pagination + filter theo type/difficulty).
- [ ] **T1.7** Trang làm bài: hiển thị câu hỏi theo part, hỗ trợ nhóm passage/audio, đồng hồ đếm ngược.
- [ ] **T1.8** Auto-save: lưu localStorage + API ghi định kỳ (debounce ~15-30s) vào `draft_answers`.
- [ ] **T1.9** Nộp bài + chấm điểm tự động (trắc nghiệm + điền từ với accepted_answers). Có unit test cho logic chấm.
- [ ] **T1.10** Trang xem lại kết quả: đáp án đúng/sai + giải thích + transcript.

### 1D. Lịch sử
- [ ] **T1.11** API + trang lịch sử làm bài của user (điểm, thời gian, link xem lại).

### 1E. Hoàn thiện MVP
- [ ] **T1.12** Dashboard đơn giản: số đề đã làm, điểm trung bình.
- [ ] **T1.13** Viết README hướng dẫn chạy dự án (setup, env, migrate, seed, run).

---

## GIAI ĐOẠN 2+ (làm sau MVP, chưa ưu tiên)

- [ ] Từ vựng: `vocab_sets`, `vocab_words`, `user_vocab_progress` (SRS SM-2) + Flashcard.
- [ ] Dashboard tiến độ chi tiết (biểu đồ, điểm mạnh/yếu, streak).
- [ ] Subscription + tích hợp thanh toán (VNPay/MoMo/PayPal).
- [ ] CMS cho Teacher (CRUD đề/câu hỏi/từ vựng, upload media).
- [ ] Ngữ pháp / bài học (`lessons`).
- [ ] Cộng đồng: bình luận, leaderboard.
- [ ] Speaking/Writing chấm AI (Job Queue xử lý ngầm).

---

## Hướng dẫn cho Agent

- Thực hiện tuần tự từ T0 -> T1.
- Mỗi task = một nhánh + một merge request về `main`.
- Cập nhật trạng thái checkbox khi hoàn thành.
- Không nhảy sang Giai đoạn 2 khi MVP chưa xong.
