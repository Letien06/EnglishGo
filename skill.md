# Skill & Context Guide cho AI Coding Agent

> File này cung cấp bối cảnh, quy ước và kỹ năng cần thiết để AI coding agent (Codex 5.5)
> hiểu dự án và sinh code đúng chuẩn. Đọc file này + `workflow.md` TRƯỚC khi bắt đầu bất kỳ task nào.

---

## 1. Bối cảnh dự án

Nền tảng web học TOEIC Dautoeic-style cho mục đích học cá nhân: hub học tập, luyện Listening/Reading/Grammar/Vocabulary/Mock Test, luyện lại câu sai/câu đã đánh dấu, theo dõi tiến độ. Tất cả tính năng học là free; không thiết kế paywall, bán gói, checkout hay Premium.
Nguồn nội dung đi theo 2 luồng hợp pháp: AI generate câu hỏi TOEIC-style mới và CMS/community/import do admin/teacher/contributor nhập. Không copy đề/câu hỏi/audio từ Dautoeic, Study4, sách/PDF thương mại hay web khác khi không có quyền. Nội dung AI/import phải ở trạng thái draft/pending review trước, admin duyệt mới publish vào question bank.
Xem chi tiết thiết kế trong `workflow.md`.

**Ưu tiên MVP:** Auth (Firebase) -> Luyện đề (làm bài, chấm điểm, xem đáp án) -> Lịch sử làm bài.

---

## 2. Tech Stack (ĐÃ CHỐT - Java Web + MySQL + Firebase Auth)

- **Ngôn ngữ:** Java 17+
- **Framework:** Spring Boot 3.x (Spring MVC + Spring Security + Spring Data JPA)
- **Build:** Maven
- **Database:** MySQL 8.x (database chính, lưu toàn bộ dữ liệu nghiệp vụ)
- **Migration:** Flyway (bắt buộc, mọi thay đổi schema qua file migration có version)
- **Auth:** **Firebase Authentication** (đăng nhập Google + email/password).
  - Frontend dùng Firebase JS SDK để đăng nhập, lấy **Firebase ID token**.
  - Backend dùng **Firebase Admin SDK** verify ID token, rồi đồng bộ user vào bảng `users` (theo `firebase_uid`).
  - Spring Security dùng filter kiểm tra token + gán role (Student/Teacher/Admin) từ DB.
- **Template:** Thymeleaf
- **CSS:** Tailwind CSS
- **JS tương tác:** Alpine.js + HTMX + Firebase JS SDK (auth)
- **CI/CD:** GitLab CI/CD
- **Media:** S3 / object storage, lưu đường dẫn tương đối + `MEDIA_BASE_URL`

> Lưu ý kiến trúc: Firebase CHỈ lo authentication. Toàn bộ dữ liệu (đề thi, câu hỏi,
> kết quả, từ vựng...) vẫn lưu trong MySQL vì đây là dữ liệu quan hệ phức tạp
> (JOIN, transaction, foreign key) mà NoSQL không phù hợp.

---

## 3. Quy ước code (Coding Conventions)

- **Ngôn ngữ:** Java 17+, tuân thủ OOP, clean code.
- **Đặt tên:** camelCase cho biến/method, PascalCase cho class, snake_case cho cột DB.
- **Kiến trúc layered (bắt buộc tách lớp):**
  - `controller/` - nhận request (Spring MVC `@Controller` cho trang Thymeleaf, `@RestController` cho API)
  - `service/` - logic nghiệp vụ (chấm điểm, SRS...)
  - `repository/` - Spring Data JPA repository
  - `entity/` - JPA entity (map tới bảng MySQL)
  - `dto/` - object truyền dữ liệu (không expose entity ra ngoài)
  - `config/` - cấu hình (Security, Firebase, Web...)
  - `security/` - filter verify Firebase token, phân quyền
  - `resources/templates/` - file Thymeleaf
  - `resources/static/` - CSS/JS/ảnh
  - `resources/db/migration/` - file Flyway
- **Error handling:** dùng `@ControllerAdvice` + `@ExceptionHandler` xử lý lỗi tập trung; API trả format thống nhất `{ success, data, error }`.
- **Validation:** dùng `@Valid` + Bean Validation (`jakarta.validation`) trên DTO.
- **Transaction:** dùng `@Transactional` ở tầng service cho thao tác ghi nhiều bảng (ví dụ: nộp bài + chấm điểm).
- **Không hardcode secret:** dùng `application.yml` + biến môi trường / Spring profiles (`dev`, `prod`). File service account của Firebase KHÔNG commit vào repo (đưa vào `.gitignore`, nạp qua biến môi trường).

---

## 4. Quy ước Database (BẮT BUỘC tuân thủ)

1. **Soft delete:** các bảng `tests`, `questions`, `vocab_words`, `vocab_sets`, `lessons` phải có `deleted_at`. Dùng JPA `@SQLDelete` + `@Where(clause = "deleted_at IS NULL")`, không xóa cứng.
2. **Question grouping:** passage/audio dùng chung qua bảng `question_groups`, `questions.group_id` trỏ về.
3. **Linh hoạt đáp án:** `user_answers` có `selected_option_id` (trắc nghiệm) + `text_response` (điền từ) + `is_correct`.
4. **SRS:** `user_vocab_progress` có `interval`, `ease_factor`, `repetitions`, `next_review_at` (thuật toán SM-2).
5. **Auto-save:** lưu nháp vào `draft_answers` (MVP), Redis sau này.
6. **Pagination + filtering:** dùng `Pageable` của Spring Data cho mọi danh sách.
7. **Versioning đề thi:** sửa nội dung -> tạo bản mới, không sửa đè (giữ lịch sử làm bài khớp đáp án).
8. **Mọi thay đổi schema** phải qua file Flyway mới (`V<n>__describe.sql`), không sửa file migration cũ đã chạy.
9. **User & Firebase:** bảng `users` có cột `firebase_uid` (unique). KHÔNG lưu password trong DB (Firebase quản lý). Khi user đăng nhập lần đầu -> tạo bản ghi `users` tương ứng (just-in-time provisioning).

---

## 5. Skill Frontend (để làm web "xịn" hơn)

> Agent cần áp dụng các kỹ năng FE sau để giao diện chuyên nghiệp, không chỉ "chạy được".

### 5.1. Thiết kế giao diện (UI/UX)
- **Design system nhất quán:** định nghĩa bảng màu (primary/secondary/success/error), spacing, font qua Tailwind config.
- **Responsive mobile-first:** mọi trang phải chạy tốt trên điện thoại (dùng breakpoint `sm/md/lg`).
- **Component tái sử dụng:** tách fragment Thymeleaf (`th:fragment`) cho header, footer, card câu hỏi, nút...
- **Trạng thái UI đầy đủ:** loading, empty state, error state, disabled - không để trang trống.
- **Accessibility cơ bản:** dùng thẻ semantic (`<button>`, `<label>`), `alt` cho ảnh, contrast màu đủ đọc.
- **Feedback người dùng:** toast/thông báo khi lưu, nộp bài, lỗi, đăng nhập.

### 5.2. Tương tác động (Alpine.js / HTMX / Firebase SDK)
- **Đăng nhập Google:** dùng Firebase JS SDK (`signInWithPopup` hoặc redirect), sau khi thành công gửi ID token về backend để tạo session.
- **Đồng hồ đếm ngược** khi làm bài: hiển thị thời gian còn lại, tự nộp khi hết giờ.
- **Flashcard:** hiệu ứng lật thẻ (CSS transform/transition).
- **Auto-save UI:** hiển thị trạng thái "Đã lưu lúc HH:mm" sau mỗi lần save.
- **Điều hướng câu hỏi:** danh sách câu (đã làm / chưa làm / đang xem) nhảy nhanh, không reload trang.
- **HTMX:** dùng cho cập nhật từng phần (ví dụ: lật trang danh sách đề) mà không tải lại toàn trang.

### 5.3. Hiệu năng & chất lượng FE
- Tối ưu ảnh (lazy-load ảnh câu hỏi), preload audio khi vào part nghe.
- Tránh layout shift (đặt kích thước ảnh/khung cố định).
- Gộp + minify CSS/JS qua build (Tailwind purge unused classes).

### 5.4. Form & Validation UX
- **Validate 2 lớp:** client-side (HTML5 + Alpine, feedback ngay khi blur/submit) **và** server-side (Bean Validation) — không tin client.
- **Hiển thị lỗi inline** ngay dưới field bị lỗi (không alert tổng), giữ giá trị người dùng đã nhập khi reload form lỗi (Thymeleaf `th:field` + `BindingResult`).
- **Disable nút submit** + hiện spinner khi đang gửi, tránh double-submit (đặc biệt quan trọng cho nút "Nộp bài").

### 5.5. Luồng làm bài thi (đặc thù nghiệp vụ)
- **Cảnh báo rời trang:** dùng `beforeunload` để confirm khi người dùng đang làm bài mà bấm back/đóng tab.
- **Chống mất dữ liệu khi mất mạng:** auto-save retry khi mất kết nối, hiện trạng thái "Đang lưu / Lỗi mạng, sẽ lưu lại" (không chỉ happy-path).
- **Phím tắt điều hướng:** mũi tên trái/phải hoặc số 1-4 để chọn đáp án nhanh, đặc biệt hữu ích khi luyện TOEIC tốc độ cao.
- **Đồng bộ thời gian với server:** không chỉ dùng `setInterval` phía client cho đếm giờ — tính lệch giờ so với server để tránh gian lận / lệch giờ máy người dùng.
- **Audio Listening part:** custom player (không dùng control mặc định của browser) để chặn tua/replay nếu đề yêu cầu nghe 1 lần, hoặc cho phép replay có giới hạn theo rule đề.

### 5.6. Component bổ sung cụ thể
- **Modal/Dialog** dùng Alpine (`x-show` + `x-transition`) cho xác nhận nộp bài, xem giải thích đáp án.
- **Tabs** cho trang xem kết quả (Tổng quan / Theo Part / Theo dạng câu).
- **Progress bar** hiển thị số câu đã làm / tổng số câu, tách màu theo trạng thái (đã làm, đánh dấu review, chưa làm).
- **Biểu đồ thống kê** (điểm theo thời gian, % đúng theo kỹ năng) — dùng Chart.js, load qua CDN, chỉ render khi có dữ liệu thật.
- **Skeleton loading** cụ thể cho từng loại nội dung (câu hỏi, danh sách đề, flashcard) thay vì chỉ spinner chung.

### 5.7. Bảo mật & dữ liệu phía FE
- **CSRF token:** Spring Security tạo CSRF token, nhúng vào meta tag, HTMX tự đọc và gửi kèm header trong mọi request ghi (`hx-headers` hoặc cấu hình global).
- **Chống XSS khi render nội dung do giáo viên/admin nhập** (đề bài, giải thích đáp án): escape mặc định của Thymeleaf (`th:text` không phải `th:utext`) trừ khi đã sanitize.
- **Không lưu dữ liệu nhạy cảm ở localStorage** (token Firebase chỉ giữ session ngắn hạn, không cache câu trả lời đề thi ở client lâu dài).

### 5.8. Đa ngôn ngữ & Accessibility nâng cao
- **i18n cơ bản:** dùng Thymeleaf `messages.properties` (vi/en) nếu app phục vụ cả người Việt học tiếng Anh và có thể mở rộng ngôn ngữ khác.
- **Focus management:** khi mở modal, focus tự nhảy vào modal; đóng modal trả focus về nút đã mở (quan trọng cho keyboard/screen reader user).
- **ARIA cho component động:** `aria-live` cho vùng thông báo toast/đồng hồ đếm ngược, `aria-expanded` cho dropdown/accordion.

### 5.9. PWA & hiệu năng nâng cao (optional, không bắt buộc MVP)
- Cân nhắc **Service Worker** cache static asset (Tailwind CSS, JS) để load nhanh lần sau — chỉ làm nếu task yêu cầu, tránh over-engineer ở MVP.
- **Preconnect/dns-prefetch** tới domain S3/object storage chứa ảnh/audio để giảm latency tải media câu hỏi nghe.

---

## 6. Nguyên tắc làm việc cho Agent

1. **Đọc `workflow.md` và `skill.md` trước** mọi task.
2. **Làm đúng phạm vi task** trong `task.md`, không tự ý mở rộng.
3. **Ưu tiên đơn giản cho MVP** - không over-engineer (không thêm Redis/Queue/microservice trừ khi task yêu cầu).
4. **Code phải chạy được ngay**, không để placeholder.
5. **Viết test** cho logic nghiệp vụ quan trọng (chấm điểm, SRS) bằng JUnit.
6. **Commit nhỏ, rõ ràng**, theo conventional commits (`feat:`, `fix:`, `docs:`...).
7. Mỗi task xong -> tạo **merge request** về `main`.
8. **KHÔNG commit** file service account Firebase, API key nhạy cảm hay secret vào repo.
