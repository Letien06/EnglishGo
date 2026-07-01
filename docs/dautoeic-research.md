# Dautoeic Research Notes

> Muc tieu: nghien cuu Dautoeic de bam sat luong hoc, module va hanh vi san pham cho app hoc ca nhan mien phi.
> Gioi han: khong copy logo, asset, source code, cau hoi, text marketing, noi dung bai hoc hoac file co ban quyen.

## Nguon da kiem tra

- `https://dautoeic.com/`
- `https://dautoeic.com/manifest-v7.webmanifest`
- `https://dautoeic.com/version.json`
- Public SPA bundle: `/assets/index-DFK2X1jg.js`
- Public CSS bundle: `/assets/index-BSm4AD-4.css`

## Nhan dinh tong quan

Dautoeic la mot React/Vite SPA/PWA cho nguoi hoc TOEIC. Trang chu co meta title `Dau TOEIC`, mo ta "Nen tang hoc TOEIC so 1 Viet Nam", manifest PWA, light/dark theme, version bootloader, cache/service-worker kill switch va crash recovery.

He thong duoc to chuc theo hub hoc tap thay vi chi la danh sach de thi. Nguoi hoc di tu homepage/hub sang cac module ky nang, lam bai ngan, xem tien do, luyen lai cau sai/da danh dau, hoc tu vung theo SRS va lam mock test.

## Chinh sach san pham cua app minh

- App nay danh cho nguoi hoc ca nhan.
- Tat ca module hoc se free: hub, listen, read, grammar, vocabulary, mock test, random, wrong, starred, review, leaderboard.
- Khong clone monetization: khong pricing page, khong premium lock, khong checkout, khong affiliate/revenue flow.
- Neu Dautoeic co route ban goi/payment, ta chi ghi nhan la route quan sat duoc va loai khoi scope.

## Public route map quan trong

### Learner / public can clone ve chuc nang

- `/` - landing/home.
- `/hub` - trung tam hoc tap sau dang nhap.
- `/login`, `/signup`, `/account` - auth va tai khoan.
- `/listen`, `/read`, `/speak`, `/write` - hub theo ky nang.
- `/write/part1/:questionId` - luyen Writing Part 1.
- `/grammar`, `/grammar/*`, `/grammar-bank/:setId` - ngu phap va ngan hang bai tap.
- `/listening`, `/listening/*` - listening practice theo module.
- `/reading`, `/reading/*` - reading practice theo module.
- `/vocabulary/*`, `/vocabulary/difficult`, `/vocabulary/mastered`, `/vocabulary/shared/:testId` - tu vung, tu kho, tu da thuoc, bo chia se.
- `/mock-test/*`, `/mock-test/roadmap` - thi thu va lo trinh mock test.
- `/random-practice`, `/starred-practice`, `/wrong-practice` - luyen ngau nhien, cau da danh dau, cau sai.
- `/challenge/:code`, `/challenge/:code/play` - challenge theo ma moi.
- `/leaderboard` - bang xep hang.
- `/about`, `/articles/*`, `/blog/*`, `/courses/*`, `/video/*`, `/class/*` - content/course/class.

### Route monetization quan sat duoc nhung khong clone

- `/upgrade`, `/upgrade/speak-write`, `/pro`.
- Admin payment/revenue/promotion/affiliate routes.

### Admin / CMS can clone cho quan tri noi dung

- `/admin`, `/admin/login`, `/admin-invite`.
- `/admin/topics`, `/admin/topics/:topicId/:subtopicId`, `/admin/exercises`.
- `/admin/listening`, `/admin/topic-listening`, `/admin/reading`, `/admin/vocabulary`.
- `/admin/mock-test`, `/admin/mock-test-media`, `/admin/mock-test-settings`, `/admin/mock-test-explanation-review`.
- `/admin/users`, `/admin/analytics`, `/admin/issue-reports`.
- `/admin/classes`, `/admin/class-website`, `/admin/course`, `/admin/courses`, `/admin/course-schedule`.
- `/admin/blog`, `/admin/website`, `/admin/visual-editor`, `/admin/file-manager`.
- `/admin/notifications`, `/admin/sharing`, `/admin/maintenance`.

## Module suy ra tu bundle cong khai

- Hub hoc tap: today tab, daily goals, streak, progress cards, notifications.
- Skill hubs: listening, reading, speaking, writing.
- Practice engine: timer, keyboard shortcuts, pause, skip, timed mode, report issue.
- Review loops: random practice, starred practice, wrong answers practice.
- Vocabulary: home, difficult words, mastered words, shared vocabulary, simple SRS.
- Grammar: topic/subtopic, grammar bank, progress by set.
- Mock test: home, roadmap, answer sync, media, explanation review.
- Course/video/class: content learning, assignments, course schedule.
- Admin CMS: CRUD content, upload/import CSV/Excel, analytics, users, issue reports.
- PWA/runtime: theme, version check, service-worker/cache reset, crash recovery.

## Chien luoc du lieu/noi dung cho app minh

Khong dung API hay data cua Dautoeic/Study4 lam datasource. Dautoeic dung Supabase public client va cac bang/edge functions rieng; viec thay duoc endpoint trong JS khong dong nghia voi quyen sao chep cau hoi/de thi/audio.

App minh se tao data bang 2 luong hop phap:

### AI generate TOEIC-style

- Admin dung `/admin/generate` de tao cau hoi theo format TOEIC-style.
- AI chi tao noi dung moi dua tren part/topic/difficulty, khong tai tao/copy de that.
- Ket qua AI la draft, phai qua `/admin/content-review` moi duoc publish.
- Can luu raw prompt/response, schema validation, reviewer, audit log.

### CMS/community/import

- Teacher/admin/contributor nhap cau hoi qua form hoac CSV/Excel.
- Noi dung nhap vao queue `PENDING_REVIEW`, khong publish truc tiep.
- Bat buoc source/license note: tu tao, open-license, public-domain, hoac co quyen su dung.
- Admin approve/reject/sua truoc khi learner thay trong practice.

## So sanh voi app hien tai

### Da co nen tang

- Spring Boot 3, MySQL, Flyway, Firebase Auth.
- Entity co ban: user, test, question, question group, answer option, accepted answer, attempt, draft, vocabulary, lesson, subscription, transaction, comment, leaderboard, writing job.
- Trang server-rendered: login, dashboard, tests, practice session, review, history, vocab flashcards, lessons, billing legacy, community, AI writing, teacher CMS.

### Thieu de dat trai nghiem giong Dautoeic

- Chua co hub dieu huong chuan TOEIC theo skill `Listen / Read / Speak / Write`.
- Chua co route song song voi Dautoeic: `/hub`, `/listen`, `/read`, `/mock-test`, `/vocabulary`, `/random-practice`, `/starred-practice`, `/wrong-practice`, `/leaderboard`, `/account`.
- Chua tach module TOEIC Part 1-7 ro rang; practice hien tai nam trong `/tests`.
- Chua co cau sai/cau danh dau/retry queue.
- Vocabulary chua co trang difficult/mastered/shared va review queue dung nghia.
- Dashboard chua du manh ve streak, daily goals, weak skills, progress theo ngay.
- CMS hien tai la teacher CMS don gian, chua co admin dashboard/module CMS theo skill.
- UI con theo Thymeleaf co ban, chua co design system/hub experience/PWA polish.
- Con ton tai billing/subscription demo, can vo hieu hoa trong san pham learner-free.
- Chua co pipeline tao noi dung AI, community submit, import-to-review va audit nguon noi dung.

## Huong clone hop ly cho repo nay

Repo hien tai la Spring Boot + Thymeleaf, khong phai React SPA. Vi vay khong nen rewrite sang React ngay. Cach lam thuc dung:

1. Giu Spring Boot, MySQL, Firebase Auth.
2. Tao route va UI Dautoeic-style bang Thymeleaf + Alpine/HTMX.
3. Moi task phai co FE + BE + data + test/seed de nhin thay san pham chay duoc.
4. Uu tien learner-facing truoc admin deep CMS.
5. Loai bo paywall/upgrade/payment khoi learner flow.
6. Them content pipeline: AI generate + CMS/community/import + admin review + publish.
7. Khong copy asset/text/branding/cau hoi cua Dautoeic; dat brand tam thoi la `EnglishWebApp` hoac doi thanh brand rieng sau.
