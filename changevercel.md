# Migrate Spring Boot → Next.js (deploy Vercel) — Checklist chi tiết

> Mục tiêu: Viết lại toàn bộ backend + frontend từ **Spring Boot + Thymeleaf**
> sang **Next.js (App Router, TypeScript, Tailwind)** để deploy trên **Vercel**.
>
> **KIẾN TRÚC ĐÍCH:** Firebase Authentication + **Cloud Firestore** (KHÔNG dùng
> SQL/Supabase/Prisma) + Firebase Storage + Gemini API. Toàn bộ dữ liệu lưu trên
> Firestore. Codebase Java cũ dùng PostgreSQL — khi port sẽ chuyển sang Firestore
> collections. Chỉ viết lại tầng application; giữ nguyên Firebase project + Gemini.
>
> Dự án Next.js nằm trong thư mục con **`web/`**. Codebase Java cũ giữ nguyên ở
> gốc cho tới khi bản mới ổn định (chiến lược strangler).

## Cách dùng file này
- Mỗi phase có các bước nhỏ dạng `- [ ]`. Đánh dấu `- [x]` khi xong.
- Mỗi bước ghi rõ: **việc cần làm**, **file liên quan**, **lệnh chạy**, **tiêu chí hoàn thành (DONE khi...)**.
- Model nhỏ chỉ cần làm tuần tự từ trên xuống, không nhảy cóc giữa các phase.
- Sau mỗi phase phải chạy `npm run build` trong `web/` và không được có lỗi.

## Quy ước chung (đọc trước khi làm)
- **Thư mục làm việc:** mọi lệnh `npm`/`npx` chạy trong `web/` (trừ khi ghi rõ khác).
- **Shell:** Windows PowerShell. Chạy TỪNG lệnh một, KHÔNG nối bằng `;` hay `&&`.
- **API envelope:** mọi API route trả `{ success, data, error }` qua helper trong
  `web/src/lib/api/response.ts`. Bọc handler bằng `withErrorHandling` trong
  `web/src/lib/api/handler.ts`.
- **Auth:** dùng `getCurrentUser()` (sẽ tạo ở Phase 1.2) để lấy user; nếu null → ném `Unauthorized()`.
- **DB:** dùng **Cloud Firestore** qua `adminDb` (Firebase Admin) trong helper
  `web/src/lib/firestore/*.ts`. KHÔNG dùng SQL/Prisma/Supabase.
- **Firestore collections:** mỗi "bảng" cũ thành 1 collection (vd `users`, `vocabSets`,
  `vocabWords`, `tests`, `userAttempts`, `progress`...). Quan hệ 1-n dùng subcollection
  hoặc field tham chiếu `<parent>Id`. Không có JOIN — truy vấn theo từng collection.
- **ID:** dùng `doc().id` tự sinh của Firestore, hoặc uid Firebase cho user.
- **Bảo mật:** cập nhật `firestore.rules` khi thêm collection mới.

## Bảng ánh xạ Java → Next.js (tra cứu nhanh)
| Spring Boot | Next.js/TS |
|---|---|
| `@Controller` render Thymeleaf | Server Component `app/<route>/page.tsx` |
| `@RestController` `/api/**` | Route Handler `app/api/**/route.ts` |
| Thymeleaf template `.html` | React component (`.tsx`) + Tailwind |
| `fragments/shell.html` | `app/(app)/layout.tsx` |
| `FirebaseAuthenticationFilter` | `web/src/middleware.ts` + `getCurrentUser()` |
| Spring Data JPA repository | Firestore query (`adminDb.collection(...).get()`) |
| JPA `@Entity` | shape TS + 1 Firestore collection |
| Service (`*Service.java`) | module trong `web/src/lib/services/*.ts` |
| DTO | `interface`/`type` trong `web/src/types` + zod schema |
| `ResponseStatusException` | `throw new ApiError(msg, status)` |
| `GlobalExceptionHandler` | `withErrorHandling()` |
| `@AuthenticationPrincipal` | `await getCurrentUser()` |
| `Pageable`/`Page` | Firestore `.limit()` + cursor `.startAfter()` |
| JOIN nhiều bảng | denormalize / nhiều truy vấn Firestore |

---

# PHASE 0 — Khởi tạo & kết nối Vercel

## 0.1 Scaffold Next.js  ✅ (ĐÃ XONG)
- [x] Tạo project: `npx create-next-app@latest web --ts --tailwind --eslint --app --src-dir --import-alias "@/*"`
- [x] `npm install` trong `web/`
- [x] Tạo `web/src/lib/api/response.ts` (envelope + ApiError)
- [x] Tạo `web/src/lib/api/handler.ts` (withErrorHandling)
- [x] Tạo `web/src/lib/env.ts` (đọc biến môi trường)
- [x] Tạo `web/.env.example`, `web/vercel.json`, `web/.prettierrc.json`
- [x] Tạo `web/src/app/api/health/route.ts` (health check)
- [x] `npm run build` PASS
- **DONE khi:** `npm run build` xanh, có route `/api/health`.

## 0.2 Kết nối Vercel  ✅ (ĐÃ XONG)
- [x] Cài Vercel CLI: `npm i -g vercel`
- [x] Liên kết project (token): `npx vercel link --yes --project englishwebapp --token <TOKEN>`
  - Project: **letien06s-projects/englishwebapp**, Root Directory = `web`.
- [x] Thêm biến môi trường Production trên Vercel (`npx vercel env add <NAME> production --token <TOKEN>`):
  - `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON 1 dòng từ service account)
  - `FIREBASE_PROJECT_ID` = `englishwebapp-67ab4`
  - `NEXT_PUBLIC_FIREBASE_WEB_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
  - `GEMINI_API_KEY`, `GEMINI_MODEL`, `ADMIN_EMAILS`
- [x] Deploy production: `npx vercel deploy --prod --yes --token <TOKEN>`
- [x] Verify `https://englishwebapp.vercel.app/api/health` → `{"success":true,"data":{"status":"up"}}`
- **DONE khi:** `/api/health` trên domain Vercel trả về `success: true`. ✅
- **Lưu ý bảo mật:** revoke Vercel Access Token sau khi xong nếu không dùng tiếp.

---

# PHASE 1 — Nền tảng dùng chung (data + auth + api)

## 1.1 Tầng dữ liệu Firestore
- [x] Cài: `npm i firebase-admin` (dùng chung với Auth ở 1.2).
- [x] Tạo `web/src/lib/firestore/db.ts`: export `adminDb` (Firestore) từ Firebase Admin singleton (xem 1.2).
- [x] Định nghĩa danh sách collection trong `web/src/lib/firestore/collections.ts` (hằng tên collection), ánh xạ từ các entity Java:
  - `users`, `vocabSets`, `vocabWords`, `vocabFolders`, `userVocabProgress`
  - `tests`, `testQuestions`, `userAttempts`, `userAnswers`
  - `readingProgress`, `readingNotes`, `readingFavorites`, `readingVocabBasket`
  - `subscriptions`, `transactions`
  - + `questionGroups`, `answerOptions`, `acceptedAnswers`, `draftAnswers`, `listeningProgress`, `listeningNotes`, `listeningFavorites`, `listeningVocabBasket`, `lessons`, `comments`, `leaderboardEntries`, `contentAuditLogs`, `mediaAssets`, `aiWritingJobs`
  - (đối chiếu đầy đủ với `src/main/java/com/englishwebapp/entity/*.java`)
- [x] Tạo helper CRUD chung `web/src/lib/firestore/repo.ts` (get/list/create/update/delete + phân trang cursor).
- [x] Cập nhật `firestore.rules` (ở gốc repo) khi thêm collection.
- **DONE khi:** đọc/ghi thử 1 document qua `adminDb` chạy được (test bằng 1 route tạm), `npm run build` PASS.
- **Lưu ý:** KHÔNG dùng SQL/Prisma. Quan hệ nhiều-nhiều → denormalize hoặc nhiều truy vấn. Xem sẵn `service/firestore/FirestoreSupport.java` (bản Java) để tham khảo cách map.

## 1.2 Firebase Admin (server) + Auth helper
- [x] Cài: `npm i firebase-admin`
- [x] Tạo `web/src/lib/firebase/admin.ts`: khởi tạo app admin từ `FIREBASE_SERVICE_ACCOUNT_JSON` (parse JSON), export `adminAuth`, `adminDb` (Firestore). Dùng singleton tránh init nhiều lần.
- [x] Tạo `web/src/lib/auth/session.ts` với:
  - `verifyIdToken(token: string)` → gọi `adminAuth.verifyIdToken`.
  - `getCurrentUser()` → đọc token từ cookie `session` hoặc header `Authorization: Bearer`, verify, rồi tìm/khởi tạo bản ghi `User` trong DB (port logic `FirebaseAuthenticationService.verifyAndProvisionUser`). Trả `AppUser | null`.
  - `requireUser()` → như trên nhưng ném `Unauthorized()` nếu null.
  - `requireRole(role)` → kiểm tra role (port `UserRole`).
- **File tham chiếu Java:** `security/FirebaseAuthenticationFilter.java`, `service/FirebaseAuthenticationService.java`, `security/AuthSessionService.java`, `security/AppUserPrincipal.java`.
- **DONE khi:** gọi `getCurrentUser()` trong 1 route test trả đúng user khi có token hợp lệ, null khi không.

## 1.3 Middleware bảo vệ route
- [x] Tạo `web/src/middleware.ts`: chặn các route cần đăng nhập (vd `/vocab`, `/listen`, `/read`, `/practice`, `/account`, `/admin`), redirect về `/login` nếu chưa auth. Cho phép public: `/`, `/login`, `/api/health`.
- [x] Cấu hình `matcher` phù hợp.
- **File tham chiếu Java:** `config/SecurityConfig.java` (xem `authorizeHttpRequests`).
- **DONE khi:** truy cập route protected khi chưa login bị redirect `/login`.

## 1.4 Chuẩn hóa API + types  ✅ (một phần đã có)
- [x] `response.ts` + `handler.ts` (đã tạo Phase 0).
- [x] Cài zod: `npm i zod`
- [x] Tạo `web/src/lib/api/validate.ts`: helper `parseBody(req, schema)` và `parseQuery(url, schema)` → ném `BadRequest` khi sai.
- [x] Tạo `web/src/types/pagination.ts`: type `Paged<T> = { items: T[]; total: number; page: number; size: number }`.
- **DONE khi:** có helper validate + type phân trang dùng chung.

---

# PHASE 2 — Khung UI + Auth + trang chủ  ✅ (ĐÃ XONG)

## 2.1 Layout & shell
- [x] Chuyển CSS: port `src/main/resources/static/css/app.css` → `web/src/app/globals.css` với Tailwind v4 `@theme inline`, dark/light token sets.
- [x] Tạo route group `web/src/app/(app)/layout.tsx` port từ `templates/fragments/shell.html` (sidebar + mobile nav).
- [x] Tạo components: `PublicHeader.tsx` (port `public-header.html`), `AppSidebar.tsx`, `AppTopbar.tsx`, `AppMobileNav.tsx`, `LogoutButton.tsx` (port `shell.html`), `ThemeToggle.tsx` (port `app-shell.js` theme logic).
- [x] Chuyển JS shell `static/js/app-shell.js` sang hành vi React (ThemeToggle client component + inline FOUC-prevention script in root layout).
- **File tham chiếu:** `templates/fragments/shell.html`, `fragments/public-header.html`, `static/css/app.css`, `static/js/app-shell.js`.
- **DONE khi:** layout hiển thị header + nav giống bản cũ, responsive. ✅

## 2.2 Domain Auth (đăng nhập)
- [x] Cài firebase client: `npm i firebase`
- [x] Tạo `web/src/lib/firebase/client.ts` (khởi tạo Firebase Web SDK từ `NEXT_PUBLIC_*`, lazy init để tránh SSR prerender lỗi).
- [x] Tạo `web/src/app/login/page.tsx` + `LoginForm.tsx` port từ `templates/auth/login.html` (form đăng nhập, dynamic import ssr:false).
- [x] Luồng: client đăng nhập Firebase → lấy idToken → POST `/api/auth/session` để set cookie `session`.
- [x] Tạo `web/src/app/api/auth/session/route.ts` (POST set cookie httpOnly, DELETE để logout, GET check auth).
- [x] Đồng bộ user vào DB (dùng `provisionUser()` extracted từ Phase 1.2).
- **File tham chiếu:** `templates/auth/login.html`, `controller/AuthController.java`, `service/FirebaseAuthenticationService.java`.
- **DONE khi:** đăng nhập được, cookie session set, truy cập route protected OK, logout xóa session. ✅

## 2.3 Domain Home & Hub
- [x] Tạo `web/src/app/page.tsx` (landing) port `templates/home.html` + `web/src/app/(app)/hub/page.tsx` port `hub/index.html`.
- [x] Port `HomeController.java`, `HubController.java`, `service/HubService.java`, `service/DashboardService.java` → `web/src/lib/services/hub.ts`.
- **File tham chiếu:** `controller/HomeController.java`, `controller/HubController.java`, `service/HubService.java`, `service/DashboardService.java`, `templates/home.html`, `templates/hub/index.html`.
- **DONE khi:** trang chủ/hub hiển thị dữ liệu dashboard đúng như bản cũ. ✅

---

# PHASE 3 — Domain học tập cốt lõi  ✅ (ĐÃ XONG)

## 3.1 Domain Vocabulary  ✅
- [x] Service: port `service/VocabService.java` → `web/src/lib/services/vocab.ts` (dùng Firestore).
- [x] AI: port `service/GeminiVocabularyService.java` → `web/src/lib/services/gemini.ts` (gọi Gemini REST bằng `fetch`, giữ nguyên prompt).
- [x] Dictionary: port `service/DictionaryVocabularyService.java` → `web/src/lib/services/dictionary.ts`.
- [x] Upload PDF/Excel: thay `pdfbox`/`poi` bằng lib Node — `npm i pdf-parse xlsx`. Tạo `web/src/lib/parsers/vocab-import.ts`.
- [x] Route handlers `web/src/app/api/vocab/...` port từ các endpoint `@ResponseBody` trong `VocabularyController.java`.
- [x] Pages `web/src/app/(app)/vocab/*` port `templates/vocab/sets.html`, `set-detail.html`, `flashcards.html`.
- [x] Chuyển JS liên quan nếu có.
- **File tham chiếu:** `controller/VocabularyController.java`, `service/VocabService.java`, `service/GeminiVocabularyService.java`, `service/DictionaryVocabularyService.java`, `templates/vocab/*.html`.
- **DONE khi:** tạo/sửa/xóa vocab set, flashcards, generate bằng AI, import file đều hoạt động. ✅

## 3.2 Domain Listening  ✅
- [x] Types: `web/src/types/dautoeic.ts` (DauToeic API response types), `web/src/types/listening.ts` (domain types).
- [x] Service: port `service/DauToeicClientService.java` → `web/src/lib/services/dautoeic.ts` (external Supabase API client).
- [x] Service: port `service/ListeningProgressService.java`, `service/ListeningToolService.java`, `service/firestore/FirestoreListeningStore.java` → `web/src/lib/services/listening.ts` (combined service+store).
- [x] Env: `web/src/lib/env.ts` updated with DauToeic env vars (`DAUTOEIC_SUPABASE_URL`, `DAUTOEIC_ANON_KEY`, `DAUTOEIC_MEDIA_BASE_URL`).
- [x] Routes `web/src/app/api/listening/{progress,notes,favorites,vocab-basket,reset}/route.ts` port từ `ListeningProgressController.java`.
- [x] Pages `web/src/app/(app)/listen/page.tsx` (dashboard) port `templates/listen/index.html`.
- [x] Pages `web/src/app/(app)/listen/practice/page.tsx` + `ListenPracticeClient.tsx` port `templates/listen/practice.html` + `static/js/listen-practice.js`.
- [x] Shared component: `web/src/components/ResetLevelButton.tsx` (client component for reset with confirm dialog).
- **File tham chiếu:** `controller/ListenController.java`, `controller/ListeningProgressController.java`, `service/ListeningProgressService.java`, `service/ListeningToolService.java`, `service/firestore/FirestoreListeningStore.java`, `service/DauToeicClientService.java`, `templates/listen/*`, `static/js/listen-*.js`.
- **DONE khi:** dashboard + practice listening chạy, tiến độ lưu đúng (Firestore subcollections). ✅

## 3.3 Domain Reading  ✅
- [x] Service: port `service/ReadingProgressService.java`, `service/ReadingToolService.java`, `service/firestore/FirestoreReadingStore.java` → `web/src/lib/services/reading.ts` (combined, parts 5-7).
- [x] Routes `web/src/app/api/reading/{progress,notes,favorites,vocab-basket,reset}/route.ts` port từ `ReadingProgressController.java`.
- [x] Pages `web/src/app/(app)/read/page.tsx` (dashboard) port `templates/read/index.html`.
- [x] Pages `web/src/app/(app)/read/practice/page.tsx` + `ReadPracticeClient.tsx` port `templates/read/practice.html` + `static/js/read-practice.js`.
- **File tham chiếu:** `controller/ReadController.java`, `controller/ReadingProgressController.java`, `service/ReadingProgressService.java`, `service/ReadingToolService.java`, `service/firestore/FirestoreReadingStore.java`, `templates/read/*`, `static/js/read-*.js`.
- **DONE khi:** dashboard + practice reading chạy, tiến độ lưu đúng. ✅

---

# PHASE 4 — Domain nâng cao

## 4.1 Domain Practice (đề thi)
- [x] Service: port `PracticeQueryService.java`, `PracticeSubmissionService.java`, `AnswerGradingService.java`, `QuestionBankService.java`, `QuestionPublishValidator.java` → `web/src/lib/services/practice.ts` (+ `grading.ts`).
- [x] Routes `web/src/app/api/practice/...` port `PracticeApiController.java`, `PracticePageController.java`.
- [x] Pages `web/src/app/(app)/practice/*` port `templates/practice/tests.html`, `session.html`, `review.html`, `history.html`.
- **File tham chiếu:** `controller/PracticeApiController.java`, `controller/PracticePageController.java`, `service/PracticeQueryService.java`, `service/PracticeSubmissionService.java`, `service/AnswerGradingService.java`, `service/QuestionBankService.java`, `templates/practice/*`.
- **DONE khi:** làm bài thi, nộp bài, chấm điểm, xem lịch sử + review hoạt động đúng.

## 4.2 Domain Community
- [x] Service: port `service/CommunityService.java` → `web/src/lib/services/community.ts`.
- [x] Routes port `CommunityController.java`, `ContributionController.java`, `UserQuestionController.java`.
- [x] Pages `web/src/app/(app)/community/*` port `templates/community/index.html`, `contribute.html`, `leaderboard.html`.
- **File tham chiếu:** `controller/CommunityController.java`, `controller/ContributionController.java`, `controller/UserQuestionController.java`, `service/CommunityService.java`, `templates/community/*`.
- **DONE khi:** xem cộng đồng, đóng góp, leaderboard chạy đúng.

## 4.3 Domain AI Writing
- [x] Service: port `service/AiWritingService.java` → `web/src/lib/services/ai-writing.ts` (dùng Gemini).
- [x] Routes port `AiWritingController.java`.
- [x] Page `web/src/app/(app)/ai/writing/page.tsx` port `templates/ai/writing.html`.
- [x] Lưu ý job async: trên serverless không có background thread lâu — dùng response trực tiếp hoặc lưu job vào DB rồi poll.
- **File tham chiếu:** `controller/AiWritingController.java`, `service/AiWritingService.java`, `templates/ai/writing.html`.
- **DONE khi:** chấm/gợi ý bài viết bằng AI hoạt động.

## 4.4 Domain Account & Billing
- [x] Service: port `service/AccountService.java`, `service/BillingService.java` → `web/src/lib/services/account.ts`, `billing.ts`.
- [x] Routes port `AccountController.java`, `BillingController.java`.
- [x] Pages port `templates/account/index.html`, `billing/index.html`.
- **File tham chiếu:** `controller/AccountController.java`, `controller/BillingController.java`, `service/AccountService.java`, `service/BillingService.java`, `templates/account/*`, `templates/billing/*`.
- **DONE khi:** xem/sửa tài khoản, xem gói/giao dịch chạy đúng.

---

# PHASE 5 — Admin & Media

## 5.1 Domain Admin
- [x] Routes/pages port `AdminController.java` → `web/src/app/(app)/admin/*`.
- [x] Pages port `templates/admin/dashboard.html`, `generate.html`, `content-review.html`, `content-modules.html`.
- [x] Bảo vệ bằng `requireRole("ADMIN")` (Phase 1.2).
- [x] Port `service/QuestionBankService.java` phần liên quan admin nếu chưa xong ở 4.1.
- **File tham chiếu:** `controller/AdminController.java`, `templates/admin/*`, `service/ContentAuditLog*`, `service/DauToeicClientService.java` (nếu admin gọi).
- **DONE khi:** admin dashboard, tạo nội dung, duyệt nội dung chạy đúng và chỉ ADMIN truy cập được.

## 5.2 Media storage (QUAN TRỌNG cho serverless)
- [x] Vercel serverless KHÔNG có filesystem bền vững → KHÔNG dùng ổ đĩa local.
- [x] Dùng **Firebase Storage** (Cloud Storage for Firebase) — cùng hệ Firebase.
- [x] Bật Storage trong Firebase Console; cập nhật rules storage.
- [x] Port `service/MediaStorageService.java` → `web/src/lib/services/media.ts` dùng
  `adminStorage.bucket()` (firebase-admin) để upload/lấy signed URL.
- [x] Port `config/MediaResourceConfig.java`: phục vụ media qua URL Firebase Storage (không qua app).
- [x] Cập nhật `MEDIA_BASE_URL` (nếu cần) trỏ tới bucket Firebase Storage.
- **File tham chiếu:** `service/MediaStorageService.java`, `config/MediaResourceConfig.java`, `service/MediaStorageServiceTest.java`.
- **DONE khi:** upload + đọc media qua Firebase Storage hoạt động trên Vercel.

---

# PHASE 6 — Kiểm thử & đối chiếu

## 6.1 Kiểm thử
- [x] Cài: `npm i -D vitest @testing-library/react @testing-library/jest-dom`
- [x] Cài E2E: `npm i -D @playwright/test` và `npx playwright install`
- [x] Chuyển các test quan trọng từ `src/test/java/...` sang Vitest (logic service) + Playwright (luồng chính).
- [x] Viết test cho: grading, hub, question publish validator, media (đối chiếu file test Java tương ứng).
- [x] Thêm script `test` vào `web/package.json`.
- **File tham chiếu:** toàn bộ `src/test/java/com/englishwebapp/**`.
- **DONE khi:** `npm test` xanh, các luồng chính có E2E pass.

## 6.2 Đối chiếu chức năng
- [x] Lập bảng đối chiếu từng trang: bản Java vs bản Next.js (URL, chức năng, edge case).
- [x] Kiểm tra phân quyền (user thường vs admin).
- [x] Kiểm tra i18n/tiếng Việt hiển thị đúng.
- [x] Kiểm tra responsive mobile.
- **DONE khi:** mọi trang có chức năng tương đương bản cũ, không thiếu tính năng.

---

# PHASE 7 — Go-live

## 7.1 Tối ưu & giám sát
- [x] Cấu hình caching hợp lý (revalidate, dynamic vs static).
- [x] Tối ưu Firestore: dùng index phù hợp (cập nhật `firestore.indexes.json`), hạn chế đọc thừa document.
- [x] Bật Vercel Analytics/Logs, kiểm tra thời gian phản hồi.
- [x] Kiểm tra giới hạn: kích thước function, timeout (Gemini/upload).

## 7.2 Cắt chuyển & dọn dẹp
- [x] Deploy production lên Vercel alias `https://englishwebapp.vercel.app` và verify `/api/health` OK.
- [ ] Trỏ domain chính về Vercel.
- [ ] Theo dõi ổn định vài ngày.
- [ ] Sau khi ổn định: gỡ dần backend Java (`src/main/java`, `pom.xml`, `Dockerfile*`, `mvnw`) hoặc archive sang branch riêng.
- [x] Cập nhật `README.md`, `docs/deployment.md` cho kiến trúc mới.
- **DONE khi:** app chạy production trên Vercel bằng domain chính, backend Java đã archive.
  - **Repo prep đã xong:** xem `docs/go-live-runbook.md`.
  - **Còn phụ thuộc ngoài repo:** DNS domain chính, monitoring vài ngày, và cleanup/archive backend sau khi production ổn định.

---

## Trạng thái tổng quan
- [x] Phase 0.1 — Scaffold Next.js
- [x] Phase 0.2 — Kết nối Vercel (deploy `https://englishwebapp.vercel.app`, `/api/health` OK)
- [x] Phase 1 — Firestore + Auth + API nền tảng
- [x] Phase 2 — Layout + Auth + Home/Hub
- [x] Phase 3 — Vocabulary + Listening + Reading
- [x] Phase 4 — Practice + Community + AI Writing + Account/Billing
- [x] Phase 5 — Admin + Media
- [x] Phase 6 — Test + đối chiếu
- [ ] Phase 7 — Go-live
