# Báo cáo nợ kỹ thuật – Dự án EnglishWebApp (Next.js)

Tài liệu này tập trung vào 5 nhóm vấn đề ưu tiên cần xử lý. Mỗi mục gồm: mô tả vấn đề, bằng chứng (file:dòng), hậu quả và hướng khắc phục cụ thể.

| Ưu tiên | Vấn đề | Mục | Trạng thái |
|---------|--------|-----|------------|
| P1 | Bỏ pattern đọc-cả-collection, dùng query + index | 1 | 🟡 Đã xử lý phần lớn, còn `findTests()` và refactor sâu |
| P1 | Timer tự nộp bài | 2 | ✅ Đã xử lý client + server |
| P2 | Chuẩn hóa guard + Zod cho mọi route | 3 | 🟡 Đã xử lý route/service trọng điểm, còn chuẩn hóa toàn bộ route khác |
| P2 | Bỏ counter auto-increment, dùng ID Firestore + batch | 4 | ⬜ Chưa làm, cần migration ID số |
| P3 | Gộp listening/reading, dọn xử lý lỗi im lặng | 5 | 🟡 Đã bỏ silent catch trong vocab, chưa gộp listening/reading |

---

## 🐞 BUG: Tiến độ luyện nghe không được khôi phục khi vào lại bài — ✅ Đã fix (Zoo, 2026-07-03)

**Triệu chứng (do người dùng báo):** Ở dashboard `/listen` hiển thị đã làm `4/90` câu, nhưng khi bấm **Luyện ngay** vào trang luyện tập thì UI quay về câu `1/90` và **không** giữ lại đáp án nào đã chọn trước đó.

**Kết luận audit:** Bug này **chưa từng được ghi vào tài liệu** và **GPT chưa fix**. Đây là bug độc lập với các mục P1–P3 bên dưới.

**Nguyên nhân gốc:**
- Đáp án được lưu server đúng: mỗi lần chọn, [`ListenPracticeClient`](web/src/app/(app)/listen/practice/ListenPracticeClient.tsx:124) `POST /api/listening/progress`, service ghi doc theo `questionId` với `selectedAnswer`/`correct` ([`recordProgress()`](web/src/lib/services/learning-tool-service.ts:114)). Dashboard đọc lại qua [`summarize()`](web/src/lib/services/learning-tool-service.ts:79) nên đếm đúng `4/90`.
- **Nhưng trang luyện tập không hề tải lại tiến độ đã lưu.** [`page.tsx`](web/src/app/(app)/listen/practice/page.tsx:24) chỉ nạp nội dung bài từ DauToeic, còn client khởi tạo `answeredMap` = `{}` và luôn bắt đầu ở index 0. ⇒ Không có cơ chế rehydrate đáp án.

**Cách fix:**
1. Thêm [`loadAnswers(uid, part, level)`](web/src/lib/services/learning-tool-service.ts:114) trả về map `questionId → selectedAnswer` (đọc từ `progressCollection`, dùng lại `findProgressByPartAndLevel`).
2. Export `loadAnswers` trong [`listening.ts`](web/src/lib/services/listening.ts:14).
3. [`page.tsx`](web/src/app/(app)/listen/practice/page.tsx:73) gọi `listening.loadAnswers(user.uid, pNum, level)` (best-effort try/catch) và truyền `savedAnswers` xuống client.
4. [`ListenPracticeClient`](web/src/app/(app)/listen/practice/ListenPracticeClient.tsx:44) seed `answeredMap` từ `savedAnswers`; `initialItemIndex()` giờ ưu tiên param `q` (deep link / điều hướng trong trang), nếu không có thì **nhảy tới câu chưa trả lời đầu tiên** (`firstUnansweredIndex`).

**Kết quả:** Vào lại bài, các câu đã chọn được tô lại đúng trạng thái và con trỏ dừng ở câu tiếp theo chưa làm, khớp với `4/90` ngoài dashboard.

---

## ✅ KẾT QUẢ KIỂM TRA LẠI (audit bởi Zoo) — 2026-07-03

Đã đối chiếu từng mục GPT tick với code thực tế. Kết luận: **các mục đã tick là ĐÚNG**, code khớp mô tả. Dưới đây là xác nhận + vài điểm cần GPT làm rõ/hoàn thiện thêm.

### Đã xác minh ĐÚNG (khớp code)
- [x] `handler.ts` — [`withErrorHandling()`](web/src/lib/api/handler.ts:14) trả `"Internal server error"` (500) + `console.error` cho lỗi ngoài `ApiError`, chỉ lộ `err.message` khi là `ApiError`. **ĐẠT.**
- [x] `repo.list()` — [dòng 45-63](web/src/lib/firestore/repo.ts:45) dùng `count()` cho `total`, cursor `startAfter`, trả `nextCursor`. **ĐẠT.**
- [x] `my-sets/[setId]/route.ts` — dùng `requireUser()` + `parseBody()` + `BadRequest()` cho cả PATCH/DELETE/POST. **ĐẠT.**
- [x] Timer auto-submit — [`PracticeSessionClient.tsx:111-123`](web/src/app/(app)/practice/session/[testId]/PracticeSessionClient.tsx:111): khi `value <= 1` → `clearInterval` + `submitRef.current("timeout")`; chống double-submit bằng `submittingRef`. **ĐẠT (phía client).**
- [x] API submit chấp nhận mảng rỗng — [schema submit](web/src/app/api/practice/tests/[testId]/submit/route.ts:8) không có `.min(1)` → nộp bài trắng khi hết giờ OK. **ĐẠT.**
- [x] `vocab.ts` bỏ `allDocs()`; [`publishedSets()`](web/src/lib/services/vocab.ts:55), [`wordsForSet()`](web/src/lib/services/vocab.ts:78) dùng `.where(...)`. **ĐẠT.**
- [x] [`review()`](web/src/lib/services/vocab.ts:912) đọc trực tiếp `vocabWords/{wordId}`. **ĐẠT.**
- [x] [`findPublishedSet()`](web/src/lib/services/vocab.ts:70) đọc trực tiếp `vocabSets/{setId}`; `getSession/getFilteredSession/getSetDetail` dùng nó + `NotFound()`. **ĐẠT.**
- [x] [`findSetCards()`](web/src/lib/services/vocab.ts:283) + [`wordCountBySetId()`](web/src/lib/services/vocab.ts:89) đếm theo set đang hiển thị (dùng `where in`, chunk 30). **ĐẠT** (không còn N×M scan toàn bộ).
- [x] [`userProgressDocs()`](web/src/lib/services/vocab.ts:109) và [`findProgress()`](web/src/lib/services/vocab.ts:126) không còn silent catch. **ĐẠT.**
- [x] [`getReviewSession()`](web/src/lib/services/vocab.ts:527) dùng `adminDb.getAll(...)` batch thay vì tải toàn bộ words. **ĐẠT** (cải thiện thêm ngoài yêu cầu).

### ⚠️ CẦN GPT LÀM RÕ / SỬA THÊM (chưa đạt hẳn)

**A. `practice.getHistory()` — dùng `.offset()` không phải cursor thật.**
- Hiện trạng: [`getHistory()`](web/src/lib/services/practice.ts:245) dùng `.offset(start).limit(safeSize)` + `count()`. Đúng là **không còn fetch-từ-đầu-rồi-slice trong app**, nhưng Firestore `.offset(n)` **vẫn tính phí đọc n document bị bỏ qua** ở phía server → trang càng sâu càng đắt.
- Yêu cầu: nếu lịch sử có thể dài, chuyển sang **cursor thật** (`startAfter(lastDoc)` theo `submittedAtMillis`), trả `nextCursor`. Nếu chấp nhận danh sách ngắn thì ghi rõ lý do giữ `.offset()` vào comment.

**B. Timer phía server — GỐC RỄ chưa xử lý.**
- Hiện trạng: [`submit()`](web/src/lib/services/practice.ts:156) đặt `startedAtMillis = submittedAtMillis` (cả hai đều `Date.now()` tại lúc nộp). **Không có** thời điểm bắt đầu phiên được lưu, **không có** kiểm tra `duration`. ⇒ Người dùng mở tab lâu bao nhiêu cũng nộp được, timer client chỉ mang tính hiển thị.
- Yêu cầu cụ thể cho GPT:
  1. Khi tạo phiên (getPracticeSession/loadContent) **lưu `startedAtMillis` thật** vào `practiceDrafts/{testId}` (hoặc doc session riêng) ngay lần đầu mở.
  2. Trong `submit()`, đọc `startedAtMillis` đã lưu; tính `elapsed = now - startedAtMillis`; nếu `elapsed > duration*60_000 + grace` thì đánh dấu `expired = true` (vẫn chấm nhưng ghi cờ hết giờ), **không tin** giá trị thời gian do client gửi.
  3. Trả `startedAtMillis` thật về client để timer đồng bộ (tránh reset khi F5).

**C. Thống kê progress vocab vẫn tải-rồi-filter (mục 1.1 chưa xong hẳn).**
- Hiện trạng đúng như GPT ghi: [`totalWords`](web/src/lib/services/vocab.ts:187)/[`learnedWords`](web/src/lib/services/vocab.ts:193)/[`masteredWords`](web/src/lib/services/vocab.ts:204)/[`dueWords`](web/src/lib/services/vocab.ts:210) vẫn `userProgressDocs()` rồi `.filter().length`.
- Yêu cầu: chuyển sang `count()` aggregation có điều kiện, ví dụ `dueWords` = `where("status","!=","NEW").where("nextReviewAtMillis","<=",now).count()`; `masteredWords` = `where("status","==","MASTERED").count()`. Nhớ khai báo composite index trong [`firestore.indexes.json`](firestore.indexes.json).

**D. `liveFolders()` vẫn đọc cả collection.**
- [`liveFolders()`](web/src/lib/services/vocab.ts:65) còn `adminDb.collection(FOLDERS).get()` rồi filter `deletedAtMillis`. Nên thêm `.where("deletedAtMillis","==",null)` (hoặc field `active`) + index, nhất quán với hướng đã làm cho sets/words.

### Kết luận nhanh cho GPT
Phần đã tick: **fix đúng hướng, code khớp** — giữ nguyên. Còn lại cần làm: **B (timer server — quan trọng nhất)**, rồi **C, D** để đóng mục 1.1, và cân nhắc **A**. Các mục 4 (counter) và 5.1 (gộp listening/reading) vẫn để trạng thái chưa làm như đã ghi.

---

## ✅ CẬP NHẬT SAU KHI FIX A/B/C/D — 2026-07-03

- [x] **A. `practice.getHistory()` bỏ `.offset()`**: đã chuyển sang cursor thật bằng `orderBy("submittedAtMillis", "desc")` + `orderBy(documentId, "desc")` + `startAfter(...)`, trả `nextCursor`; trang history dùng `?cursor=...`.
- [x] **B. Timer phía server**: khi mở phiên, server tạo/giữ `practiceDrafts/{testId}.startedAtMillis`; client nhận `startedAtMillis/serverNowMillis/expiresAtMillis` để F5 không reset giờ; submit đọc `startedAtMillis` từ Firestore, tính `elapsedMillis`, đánh dấu `expired` nếu vượt `duration + grace`, và lưu vào attempt.
- [x] **C. Thống kê progress vocab**: `totalWords`, `learnedWords`, `masteredWords`, `dueWords`, `studiedWordsToday` đã dùng Firestore `count()`; `streakDays` không còn đọc toàn bộ progress mà query `lastReviewedAtMillis` gần nhất có giới hạn.
- [x] **D. `liveFolders()`**: đã query `.where("deletedAtMillis", "==", null)`; `createMyFolder()` ghi `deletedAtMillis: null` cho dữ liệu mới.
- [x] Cập nhật `firestore.indexes.json` cho các query mới: history cursor, `userVocabProgress` theo `setId/status/nextReviewAtMillis/lastReviewedAtMillis`, và `vocabFolders.deletedAtMillis`.

Ghi chú còn lại: `findTests()` vẫn phân trang trong app vì nguồn DauToeic mirror hiện trả danh sách test dạng mảng; muốn cursor thật cần đổi tầng mirror/index dữ liệu test. `nextId()` và gộp listening/reading vẫn là việc migration/refactor riêng.

---

## Trạng thái xử lý

- [x] `withErrorHandling()` không trả `err.message` thô cho lỗi ngoài `ApiError`.
- [x] `PracticeSessionClient` tự nộp khi hết giờ, chống double-submit và khóa input khi đang submit.
- [x] API submit practice chấp nhận mảng đáp án rỗng để auto-submit bài trắng khi hết giờ.
- [x] `my-sets/[setId]/route.ts` dùng `requireUser()` + Zod `parseBody()` cho PATCH/POST JSON.
- [x] `vocab.ts` bỏ `allDocs()` và `publishedWords()` đọc toàn collection.
- [x] `wordsForSet()` query trực tiếp theo `setId` + `status`.
- [x] `review()` đọc trực tiếp `vocabWords/{wordId}` thay vì tải toàn bộ words.
- [x] `getSession()`, `getFilteredSession()`, `getSetDetail()` đọc trực tiếp `vocabSets/{setId}`.
- [x] Các list vocab chính dùng `wordCountBySetId()` để đếm theo set đang hiển thị, không scan toàn bộ words.
- [x] Bỏ silent catch trong `userProgressDocs()` và `findProgress()`.
- [x] Đổi lỗi nghiệp vụ chính trong `vocab.ts` sang `BadRequest`/`Unauthorized`/`Forbidden`/`NotFound`.
- [x] `firestore/repo.list()` dùng `count()` cho `total` thật.
- [x] `practice.getHistory()` dùng cursor thật `startAfter`, không dùng `.offset()` và không slice trong app.
- [x] Các thống kê progress vocab (`totalWords`, `learnedWords`, `masteredWords`, `dueWords`, `studiedWordsToday`) dùng `count()`; `streakDays` giới hạn query gần nhất.
- [x] `liveFolders()` query active folders bằng `deletedAtMillis == null`.
- [ ] `practice.findTests()` vẫn lấy danh sách test từ DauToeic mirror rồi slice trong app; cần cursor/pagination thật nếu nguồn dữ liệu hỗ trợ.
- [x] Timer practice có kiểm tra thời gian phía server bằng `startedAtMillis`/duration/grace và lưu `expired`.
- [ ] Chưa chuẩn hóa tất cả route còn dùng `getCurrentUser()` + body cast thủ công.
- [ ] Chưa bỏ `nextId()`/counter vì cần migration dữ liệu ID số.
- [ ] Chưa gộp `listening.ts` và `reading.ts`.

---

## 1. [P1] Bỏ pattern đọc-cả-collection, dùng query + index — 🟡 Đã xử lý phần lớn

### 1.1. Đọc toàn bộ collection vào bộ nhớ — 🟡 Đã xử lý phần lớn, còn refactor sâu

**Vấn đề:** Toàn bộ service `vocab` được xây trên một hàm helper đọc **nguyên collection** rồi lọc/đếm trong bộ nhớ ứng dụng, thay vì để Firestore lọc bằng query + index.

**Bằng chứng:**
- [`allDocs()`](web/src/lib/services/vocab.ts:54) gọi `adminDb.collection(collection).get()` — kéo về **mọi document** rồi trả `snap.docs`.
- Các hàm phái sinh đều dựa trên nó: [`publishedSets()`](web/src/lib/services/vocab.ts:59), [`publishedWords()`](web/src/lib/services/vocab.ts:66), [`liveFolders()`](web/src/lib/services/vocab.ts:73), [`wordsForSet()`](web/src/lib/services/vocab.ts:78) (đọc **tất cả** words rồi lọc theo `setId`).
- [`userProgressDocs()`](web/src/lib/services/vocab.ts:83) đọc toàn bộ progress của user; các thống kê [`totalWords()`](web/src/lib/services/vocab.ts:169), [`learnedWords()`](web/src/lib/services/vocab.ts:175), [`masteredWords()`](web/src/lib/services/vocab.ts:186), [`dueWords()`](web/src/lib/services/vocab.ts:192) đều `filter` mảng trong bộ nhớ.
- [`findSetCards()`](web/src/lib/services/vocab.ts:265) load hết sets **và** hết words, ghép đếm theo kiểu N×M.
- [`review()`](web/src/lib/services/vocab.ts:886) load **tất cả** words chỉ để tìm đúng 1 từ cần cập nhật.

**Hậu quả:**
- Chi phí đọc Firestore tăng tuyến tính theo tổng dữ liệu (không theo dữ liệu thực dùng) → **tốn tiền** và **chậm dần** khi dữ liệu lớn.
- Rủi ro tràn bộ nhớ / timeout serverless khi collection lớn.
- Không tận dụng được index; mọi thao tác lọc chạy ở tầng app.

**Khắc phục:**
- Thay `allDocs` bằng query có điều kiện: ví dụ `wordsForSet` dùng `collection("vocabWords").where("setId", "==", setId).get()`.
- Với thống kê đếm (`totalWords`, `learnedWords`, `dueWords`, `masteredWords`) dùng **aggregation `count()`** của Firestore thay vì kéo mảng về đếm; hoặc `where("uid","==",uid).where("dueAt","<=",now)` cho `dueWords`.
- `review()` truy vấn trực tiếp từ theo `wordId` thay vì tải cả collection.
- Khai báo composite index tương ứng trong [`firestore.indexes.json`](firestore.indexes.json).

### 1.2. Phân trang giả (đọc hết rồi cắt trong bộ nhớ) — 🟡 Đã xử lý phần lớn, còn `findTests()`

**Vấn đề:** Phân trang không dùng cursor thật của Firestore mà tải nhiều/tất cả rồi `slice`, đồng thời trả `total` sai ngữ nghĩa.

**Bằng chứng:**
- [`list()`](web/src/lib/firestore/repo.ts:31) trả `total: items.length` — đây là số phần tử **của trang hiện tại**, không phải tổng số bản ghi ⇒ mọi UI dựa vào `total` để tính số trang đều sai.
- [`getHistory()`](web/src/lib/services/practice.ts:245) đặt `fetchLimit = (safePage + 1) * safeSize` rồi `slice` — tức luôn kéo về từ đầu đến hết trang cần xem (offset-in-memory), trang càng sâu càng đọc nhiều.
- [`findTests()`](web/src/lib/services/practice.ts:97) tải tất cả tests rồi cắt.

**Hậu quả:** Chi phí đọc tăng theo số trang; số trang/tổng bản ghi hiển thị sai; không mở rộng được.

**Khắc phục:**
- Dùng **cursor pagination** thật: `orderBy(...).startAfter(lastDoc).limit(size)`, trả `nextCursor` (document ID hoặc giá trị sort) thay vì offset.
- Nếu cần tổng số, tính bằng `count()` aggregation riêng, tách khỏi `items.length`.
- Sửa `list()` trong `repo.ts` để không dùng `items.length` làm `total`.

---

## 2. [P1] Timer tự nộp bài — ✅ Đã xử lý client + server

**Vấn đề:** Đồng hồ đếm ngược trong phiên luyện tập chỉ giảm số giây hiển thị, **không tự nộp bài** khi về 0. Người dùng có thể tiếp tục làm sau khi hết giờ.

**Bằng chứng:**
- [`PracticeSessionClient`](web/src/app/(app)/practice/session/[testId]/PracticeSessionClient.tsx:27): `setInterval(() => setRemaining(v => Math.max(v - 1, 0)), 1000)` — khi `remaining` chạm 0, không có nhánh nào gọi `submit()`.
- Việc nộp bài chỉ xảy ra khi người dùng bấm nút thủ công qua [`submit()`](web/src/app/(app)/practice/session/[testId]/PracticeSessionClient.tsx:69).

**Hậu quả:**
- Sai nghiệp vụ bài thi có giới hạn thời gian: hết giờ nhưng không khóa/nộp.
- Không công bằng và không phản ánh đúng điểm số thực tế.

**Khắc phục:**
- Trong `useEffect` của timer: khi `remaining` đạt 0 → `clearInterval`, khóa UI (disable input) và gọi `submit()` tự động (chống double-submit bằng cờ trạng thái).
- **Bắt buộc chấm điểm phía server dựa trên thời gian server**, không tin timer client: server lưu `startedAt`, khi nhận submit kiểm tra `now - startedAt <= duration` (kèm biên độ nhỏ). Nếu quá hạn, vẫn chấm nhưng đánh dấu hết giờ.
- Cân nhắc cảnh báo trước khi hết giờ (ví dụ còn 1 phút).

---

## 3. [P2] Chuẩn hóa guard + Zod cho mọi route — 🟡 Đã xử lý một phần

**Vấn đề:** Các route handler không nhất quán về (a) cách xác thực người dùng và (b) cách validate input; ngoài ra lỗi nghiệp vụ bị ném sai loại nên rò rỉ chi tiết nội bộ và trả sai mã HTTP.

**Bằng chứng:**
- Không nhất quán guard:
  - [`my-sets/[setId]/route.ts`](web/src/app/api/vocab/my-sets/[setId]/route.ts:16) dùng `getCurrentUser()` + kiểm tra thủ công `if (!user) ...`, và ép kiểu body bằng `body as {...}` (không validate).
  - Trong khi [`submit/route.ts`](web/src/app/api/practice/tests/[testId]/submit/route.ts:20) dùng đúng chuẩn `requireUser()` + `parseBody(req, schema)`.
- Ném lỗi sai loại: nhiều chỗ trong service dùng `throw new Error("...")` thay vì lỗi có mã HTTP, ví dụ `throw new Error("Set not found")` tại [`getSession()`](web/src/lib/services/vocab.ts:460) — đáng lẽ 404 nhưng thành 500.
- Rò rỉ chi tiết: [`withErrorHandling()`](web/src/lib/api/handler.ts:14) trả về `err.message` của lỗi không phải `ApiError` cho client → lộ thông tin nội bộ và trả 500 cho các lỗi lẽ ra là 4xx.

**Hậu quả:**
- Bề mặt bảo mật không đồng nhất, dễ bỏ sót kiểm tra quyền.
- Input không được validate → nguy cơ dữ liệu bẩn, lỗi runtime.
- Client nhận sai mã lỗi (500 thay vì 400/403/404) và thông điệp nội bộ bị lộ.

**Khắc phục:**
- **Guard chuẩn:** mọi route cần đăng nhập dùng [`requireUser()`](web/src/lib/auth/session.ts:184); route cần quyền dùng [`requireRole()`](web/src/lib/auth/session.ts:194). Loại bỏ pattern `getCurrentUser()` + `if (!user)` thủ công.
- **Validate chuẩn:** mọi body/query đi qua [`parseBody()`](web/src/lib/api/validate.ts:13) / [`parseQuery()`](web/src/lib/api/validate.ts:34) với schema Zod. Bỏ hết `body as {...}`.
- **Lỗi có mã:** thay `new Error(...)` bằng các helper trong [`response.ts`](web/src/lib/api/response.ts): `NotFound()` (404), `Forbidden()` (403), `Unauthorized()` (401), `BadRequest()` (400). Cập nhật `getSession` và các chỗ tương tự.
- **Handler an toàn:** sửa `withErrorHandling` để chỉ trả `message` khi là `ApiError`; với lỗi khác trả thông điệp chung chung ("Internal error") + log chi tiết ở server, không gửi ra client.

---

## 4. [P2] Bỏ counter auto-increment, dùng ID Firestore + batch — ⬜ Chưa làm

**Vấn đề:** Dự án mang theo mô hình ID tự tăng kiểu SQL (di sản từ Spring/JPA), hiện thực bằng một document đếm dùng chung — đây là anti-pattern "hot document" trên Firestore, và còn bị gọi trong vòng lặp.

**Bằng chứng:**
- [`nextId()`](web/src/lib/services/vocab.ts:150) chạy `runTransaction` đọc/ghi một document counter dùng chung mỗi lần cần ID mới.
- [`saveCandidates()`](web/src/lib/services/vocab.ts:974) gọi `nextId` **trong vòng lặp** khi lưu nhiều từ ⇒ nhiều transaction tuần tự trên cùng một hot document.

**Hậu quả:**
- Ghi tập trung vào 1 document counter → **contention/nghẽn**, giới hạn ~1 ghi/giây trên document đó, dễ lỗi khi ghi song song.
- Lưu nhiều bản ghi rất chậm vì transaction tuần tự.
- Ghép nối chặt với mô hình quan hệ cũ, khó mở rộng.

**Khắc phục:**
- Dùng **ID tự sinh của Firestore** (`collection.doc()` không tham số) hoặc UUID cho các bản ghi mới; bỏ document counter.
- Lưu hàng loạt bằng **batched write** / `bulkWriter` thay vì `nextId` trong vòng lặp.
- Nếu bắt buộc phải giữ số thứ tự hiển thị cho người dùng, tách nó thành trường phái sinh (không dùng làm khóa chính) và sinh phía client hoặc theo timestamp.
- Lên kế hoạch migration cho dữ liệu cũ đang dùng ID số.

---

## 5. [P3] Gộp listening/reading, dọn xử lý lỗi im lặng — 🟡 Đã xử lý một phần

### 5.1. Trùng lặp gần như hoàn toàn giữa listening và reading — ⬜ Chưa làm

**Vấn đề:** Hai service `listening` và `reading` gần như là bản sao của nhau, chỉ khác dải part hợp lệ và tên subcollection.

**Bằng chứng:**
- [`listening.ts`](web/src/lib/services/listening.ts) và [`reading.ts`](web/src/lib/services/reading.ts) có cùng bộ hàm: `applyProgress`, `summarize`, `recordProgress`, `saveNote`, `toggleFavorite`, `addVocab`, `resetLevel`, cùng các helper `findProgressByPartAndLevel`, `deleteProgressByPartAndLevel`, `toProgressDoc`, `validateProgressRequest`.
- Khác biệt duy nhất: listening validate part 1–4 ([`validateProgressRequest`](web/src/lib/services/listening.ts:298)) còn reading validate part 5–7 ([`validateProgressRequest`](web/src/lib/services/reading.ts:270)); tên subcollection khác nhau (listeningProgress/notes/favorites/vocabBasket vs readingProgress/...).
- `reading.ts` đã tái sử dụng type từ `../../types/listening` (`ListeningProgressDoc`), cho thấy chúng vốn cùng một mô hình.

**Hậu quả:** Sửa một bug phải sửa hai nơi; dễ lệch logic; tăng chi phí bảo trì.

**Khắc phục:**
- Trích xuất một service dùng chung nhận **tham số cấu hình**: `{ minPart, maxPart, collectionPrefix }` (ví dụ `createToolService(config)`), rồi tạo `listening`/`reading` là hai instance mỏng.
- Đặt tên type trung tính (`ToolProgressDoc`) thay cho `ListeningProgressDoc` dùng chung.

### 5.2. Nuốt lỗi im lặng (silent catch) — ✅ Đã xử lý

**Vấn đề:** Một số hàm bắt lỗi rồi trả về giá trị rỗng, che giấu lỗi thật khiến dữ liệu trông "trống" thay vì báo lỗi.

**Bằng chứng:**
- [`userProgressDocs()`](web/src/lib/services/vocab.ts:83) có `catch { return []; }`.
- [`findProgress()`](web/src/lib/services/vocab.ts:104) có `catch { return null; }`.

**Hậu quả:**
- Lỗi hạ tầng (mất kết nối, thiếu index, phân quyền) bị nuốt → user thấy "không có dữ liệu" thay vì lỗi; rất khó chẩn đoán.
- Có thể vô tình ghi đè/hiểu sai trạng thái học tập.

**Khắc phục:**
- Bỏ `catch` nuốt lỗi; để lỗi lan lên `withErrorHandling` xử lý tập trung, hoặc `catch` có **log chi tiết** rồi re-throw dưới dạng lỗi có mã.
- Chỉ trả rỗng khi đó thực sự là trạng thái hợp lệ (ví dụ document không tồn tại), phân biệt rõ với lỗi truy vấn.
