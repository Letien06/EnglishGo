# Task Board - English Learning Web App

> Danh sách task cho AI coding agent (Codex 5.5) thực hiện theo thứ tự.
> Đọc `workflow.md` + `skill.md` trước khi bắt đầu.
> Stack: **Java 17 + Spring Boot 3.x + MySQL + Firebase Auth + Thymeleaf + Tailwind + Alpine.js/HTMX**.
> Trạng thái: [ ] chưa làm | [~] đang làm | [x] xong

---

## GIAI ĐOẠN 0 - Khởi tạo dự án (Setup)

- [x] **T0.1** Khởi tạo project Spring Boot 3.x (Maven) với dependencies: Spring Web, Spring Data JPA, Spring Security, Thymeleaf, MySQL Driver, Flyway, Lombok, Validation.
- [x] **T0.2** Cấu hình kết nối MySQL trong `application.yml` (profile `dev`), tạo `application-example.yml`.
- [x] **T0.3** Dựng cấu trúc package layered (`controller`, `service`, `repository`, `entity`, `dto`, `config`) + thư mục `templates/`, `static/`, `db/migration/`.
- [ ] **T0.4** Tích hợp Tailwind CSS + Alpine.js + HTMX vào `resources/static` (build pipeline cho Tailwind).
- [x] **T0.5** Tạo file `.gitlab-ci.yml` cơ bản (`mvn verify`: build + test + kiểm tra).
- [ ] **T0.6** Thêm dependency Firebase Admin SDK vào `pom.xml`; tạo cấu hình nạp service account qua biến môi trường (KHÔNG commit file key).

## GIAI ĐOẠN 1 - MVP

### 1A. Database schema
- [ ] **T1.1** Viết Flyway migration (`V1__init.sql`) + JPA entity cho: `users` (có `firebase_uid`, KHÔNG có password), `tests`, `question_groups`, `questions`,
      `answer_options`, `accepted_answers`, `user_attempts`, `user_answers`, `draft_answers`.
      Tuân thủ quy ước DB trong `skill.md` (soft delete qua `@SQLDelete`/`@Where`, grouping, text_response).
- [ ] **T1.2** Viết Flyway seed (`V2__seed.sql`) dữ liệu mẫu (1 đề TOEIC mini: vài câu trắc nghiệm + 1 nhóm câu hỏi có audio).

### 1B. Auth (Firebase Authentication)
- [ ] **T1.3** Frontend: trang đăng nhập dùng Firebase JS SDK (đăng nhập Google + email/password), lấy Firebase ID token.
- [ ] **T1.4** Backend: Spring Security filter verify Firebase ID token (Firebase Admin SDK), tạo session; just-in-time provisioning user vào bảng `users` theo `firebase_uid`.
- [ ] **T1.5** Phân quyền role (Student / Teacher / Admin) lưu trong DB, gán vào security context; bảo vệ route qua `@PreAuthorize` / `authorizeHttpRequests`.

### 1C. Luyện đề (lõi)
- [ ] **T1.6** Controller + trang Thymeleaf danh sách đề thi (pagination qua `Pageable` + filter theo type/difficulty).
- [ ] **T1.7** Trang làm bài: hiển thị câu hỏi theo part, hỗ trợ nhóm passage/audio, đồng hồ đếm ngược (Alpine.js).
- [ ] **T1.8** Auto-save: localStorage + REST endpoint ghi định kỳ (debounce ~15-30s) vào `draft_answers`.
- [ ] **T1.9** Nộp bài + chấm điểm tự động ở tầng `service` (`@Transactional`), hỗ trợ trắc nghiệm + điền từ (accepted_answers). Có JUnit test cho logic chấm.
- [ ] **T1.10** Trang xem lại kết quả: đáp án đúng/sai + giải thích + transcript.

### 1D. Lịch sử
- [ ] **T1.11** Controller + trang lịch sử làm bài của user (điểm, thời gian, link xem lại).

### 1E. Hoàn thiện MVP
- [ ] **T1.12** Dashboard đơn giản: số đề đã làm, điểm trung bình.
- [ ] **T1.13** Viết README hướng dẫn chạy dự án (yêu cầu Java/MySQL, cấu hình `application.yml`, Firebase service account, `mvn flyway:migrate`, `mvn spring-boot:run`).

---

## GIAI ĐOẠN 2+ (làm sau MVP, chưa ưu tiên)

- [ ] Từ vựng: entity `vocab_sets`, `vocab_words`, `user_vocab_progress` (SRS SM-2) + Flashcard (Alpine.js).
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
