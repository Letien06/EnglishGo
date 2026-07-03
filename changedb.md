# Plan chuyển toàn bộ lưu trữ sang Firestore

## Mục tiêu

Chuyển app khỏi database SQL/Railway để Railway không còn phải gánh persistence cho người dùng. Sau khi hoàn tất, dữ liệu cần lưu lâu dài sẽ nằm trong Firestore, còn nội dung bài học/bài luyện chính tiếp tục lấy từ `dautoeic.com` hoặc API ngoài tương ứng.

Mục tiêu cuối:

- Không cần `spring-boot-starter-data-jpa`, JDBC driver MySQL/PostgreSQL, Flyway, entity/repository JPA để chạy app production.
- Không cần datasource SQL trong `application.yml`, `.env`, Railway.
- Dữ liệu học cá nhân, profile, tiến độ, nháp bài làm, lịch sử làm bài, ghi chú, yêu thích, giỏ từ vựng, cộng đồng cơ bản, billing mock nếu còn dùng đều lưu Firestore.
- Identity chính là Firebase Auth UID, không phụ thuộc `Long userId` sinh từ SQL/counter.
- Các route admin/content nội bộ cũ được xóa hoặc tắt hẳn vì hiện tại không còn làm admin.

## Hiện trạng repo

App hiện là Spring Boot + Thymeleaf. SQL/JPA vẫn còn rộng:

- `pom.xml` còn `spring-boot-starter-data-jpa`, MySQL, PostgreSQL, Flyway.
- `application.yml` còn `spring.jpa` và `spring.flyway`.
- `src/main/resources/db/migration/mysql` và `postgresql` còn schema cũ.
- Nhiều service/controller vẫn inject `*Repository` JPA.
- `AuthSessionService` và nhiều controller/service dùng `AppUserPrincipal.id()` kiểu `Long`.

Phần đã bắt đầu chuyển Firestore:

- `FirebaseConfig` đã tạo bean `Firestore`.
- `FirebaseAuthenticationService` đã provision user vào collection `users`.
- `AccountService` đã đọc/ghi profile từ Firestore, nhưng vẫn tìm user bằng `Long userId`.
- `VocabService` đã lưu `vocabSets`, `vocabWords`, `vocabFolders`, `userVocabProgress` bằng Firestore, nhưng vẫn dùng `Long userId` và counter.

Điểm nghẽn chính:

- Còn giữ mô hình `Long userId` để giả lập kiểu SQL. Nếu muốn bỏ database hoàn toàn, nên đổi identity nội bộ sang `firebaseUid`/document id.
- Các bảng học mới như `listening_progress`, `reading_progress`, notes/favorites/vocab basket vẫn đang dùng JPA.
- Practice/mock test cũ (`tests`, `questions`, `user_attempts`, `draft_answers`) vẫn SQL. Nếu nội dung practice lấy từ `dautoeic.com`, chỉ cần giữ phần dữ liệu cá nhân như draft/attempt/answers trong Firestore.

## Nguyên tắc thiết kế Firestore

1. Dùng `firebaseUid` làm khóa người dùng chính.
2. Ưu tiên dữ liệu theo user dưới `users/{uid}/...` để Security Rules đơn giản và query rẻ.
3. Không cố mô phỏng quan hệ SQL. Document phải được denormalize theo màn hình cần đọc.
4. Không dùng counter toàn cục cho dữ liệu user mới. Dùng id tự nhiên hoặc Firestore auto id.
5. Với dữ liệu lấy từ `dautoeic.com`, lưu `source`, `part`, `level`, `itemId`, `questionId` để map lại nội dung gốc.
6. Các tổng hợp hay dùng trên dashboard nên ghi sẵn vào doc summary thay vì query nhiều collection mỗi lần.
7. Backend Spring vẫn có thể tồn tại để render Thymeleaf/gọi API ngoài, nhưng không được cần SQL để boot.

## Firestore schema đề xuất

### Users

`users/{uid}`

```json
{
  "uid": "firebase uid",
  "email": "user@example.com",
  "displayName": "Name",
  "avatarUrl": "https://...",
  "role": "STUDENT",
  "level": "B1",
  "targetScore": 750,
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

Ghi chú:

- Bỏ field `id` dạng `Long` sau phase identity.
- `role` chỉ giữ `STUDENT` nếu không còn admin. Nếu vẫn cần phân biệt sau này, dùng custom claims hoặc field này nhưng không expose quyền admin.

### Listening progress

`users/{uid}/listeningProgress/{questionId}`

```json
{
  "source": "DAUTOEIC",
  "part": 1,
  "level": 3,
  "itemId": "item id",
  "questionId": "question id",
  "selectedAnswer": "A",
  "correctAnswer": "A",
  "correct": true,
  "modeUsed": "normal",
  "assistPercent": 30,
  "replayCount": 0,
  "elapsedSeconds": 42,
  "score": 30,
  "completedAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

Doc id:

- `questionId` nếu unique toàn hệ thống.
- Nếu không chắc unique, dùng `{part}_{level}_{questionId}`.

### Reading progress

`users/{uid}/readingProgress/{questionId}`

Fields giống listening, trừ `replayCount` không bắt buộc.

### Listening/reading notes

`users/{uid}/listeningNotes/{itemId}`

`users/{uid}/readingNotes/{itemId}`

```json
{
  "itemId": "item id",
  "questionId": "question id or null",
  "note": "text",
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

Nếu cần nhiều note trên cùng một item thì dùng auto id và thêm index `itemId`. Hiện code cũ là 1 note / item, nên doc id `itemId` là đủ.

### Favorites

`users/{uid}/listeningFavorites/{itemId}`

`users/{uid}/readingFavorites/{itemId}`

```json
{
  "itemId": "item id",
  "questionId": "question id or null",
  "part": 1,
  "level": 3,
  "createdAt": "server timestamp"
}
```

Toggle favorite:

- Nếu doc tồn tại: delete.
- Nếu chưa tồn tại: set.

### Vocab basket từ listening/reading

`users/{uid}/listeningVocabBasket/{autoId}`

`users/{uid}/readingVocabBasket/{autoId}`

```json
{
  "itemId": "item id",
  "questionId": "question id or null",
  "word": "word",
  "normalizedWord": "word",
  "meaning": "meaning",
  "example": "example",
  "createdAt": "server timestamp"
}
```

Nên có `normalizedWord` để lọc/tránh trùng về sau.

### Progress summary

`users/{uid}/summaries/listening`

`users/{uid}/summaries/reading`

```json
{
  "byPartLevel": {
    "1_1": { "done": 10, "correct": 8, "wrong": 2, "score": 80 },
    "1_2": { "done": 3, "correct": 2, "wrong": 1, "score": 20 }
  },
  "updatedAt": "server timestamp"
}
```

Có 2 lựa chọn:

- Phase đầu: query progress theo `part` + `level` để tính như code cũ.
- Phase tối ưu: cập nhật summary bằng transaction khi record/reset progress.

Khuyến nghị làm phase đầu cho nhanh, sau đó tối ưu summary nếu dashboard chậm.

### Practice draft

`users/{uid}/practiceDrafts/{testId}`

```json
{
  "source": "DAUTOEIC",
  "testId": "test id",
  "payload": {},
  "updatedAt": "server timestamp"
}
```

Nếu practice cũ không còn dùng SQL content, `testId` nên là id từ `dautoeic.com`.

### Practice attempts

`users/{uid}/practiceAttempts/{attemptId}`

```json
{
  "source": "DAUTOEIC",
  "testId": "test id",
  "title": "test title",
  "skill": "LISTENING",
  "score": 75.5,
  "correctCount": 75,
  "questionCount": 100,
  "startedAt": "server timestamp",
  "submittedAt": "server timestamp",
  "answers": [
    {
      "questionId": "q1",
      "selectedAnswer": "A",
      "correctAnswer": "B",
      "correct": false,
      "textResponse": null
    }
  ]
}
```

Lý do để `answers` trong attempt:

- Review attempt thường đọc theo attempt, không cần query riêng từng answer.
- Tránh subcollection quá nhỏ gây nhiều round trip.
- Nếu mỗi attempt có quá nhiều câu và document gần 1 MiB, đổi sang `practiceAttempts/{attemptId}/answers/{questionId}`.

### Vocab hiện có

Đang có:

- `vocabSets`
- `vocabWords`
- `vocabFolders`
- `userVocabProgress`

Nên chuyển dần sang:

- Public/personal vocab content:
  - `vocabSets/{setId}`
  - `vocabWords/{wordId}`
  - `vocabFolders/{folderId}`
- User progress:
  - `users/{uid}/vocabProgress/{wordId}`

Phase đầu có thể giữ collection cũ để giảm rủi ro, nhưng cần đổi field `userId` sang `uid`.

### Community

Nếu vẫn giữ cộng đồng:

- `comments/{commentId}` hoặc `targets/{targetType_targetId}/comments/{commentId}`
- `leaderboards/{period}/entries/{uid}`

Nếu chưa cần cộng đồng lúc chuyển DB:

- Tắt route community hoặc trả dữ liệu rỗng.
- Đưa vào phase sau, không để nó chặn việc bỏ SQL.

### Billing

Nếu billing hiện chỉ là mock/trang hiển thị:

- `users/{uid}/subscriptions/current`
- `users/{uid}/transactions/{transactionId}`

Nếu chưa có payment thật:

- Giữ service Firestore đơn giản hoặc tắt tính năng.
- Không giữ SQL chỉ vì billing mock.

### AI writing

`users/{uid}/aiWritingJobs/{jobId}`

```json
{
  "prompt": "text",
  "response": "text",
  "status": "DONE",
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

## Phase 0 - Khóa phạm vi và tạo feature flag

Mục tiêu: chuẩn bị để chuyển từng phần mà không làm app vỡ toàn bộ.

Checklist:

- Tạo `changedb.md` làm tài liệu nguồn cho migration.
- Chốt phạm vi không còn admin/content management.
- Liệt kê route cần giữ:
  - login/logout/account
  - home/hub
  - listening từ `dautoeic.com`
  - reading từ `dautoeic.com`
  - vocabulary
  - practice nếu còn dùng
  - billing/community/AI writing nếu thật sự cần
- Thêm config dự kiến:
  - `app.storage=firestore`
  - hoặc bỏ hẳn SQL và chỉ dùng Firestore khi triển khai final.
- Chuẩn hóa cách log lỗi Firestore để biết collection/doc nào fail.

Nghiệm thu:

- Có danh sách route giữ/xóa.
- App vẫn chạy như hiện tại.
- Chưa xóa JPA ở phase này.

## Phase 1 - Đổi identity từ `Long userId` sang `firebaseUid`

Mục tiêu: cắt phụ thuộc gốc vào bảng `users`.

Việc cần làm:

- Sửa `AppUserPrincipal`:
  - đổi `Long id` thành optional/deprecated hoặc bỏ hẳn.
  - dùng `String uid`/`firebaseUid` làm id chính.
- Sửa `AuthSessionService`:
  - session key chính là `AUTH_FIREBASE_UID`.
  - không bắt buộc `AUTH_USER_ID`.
- Sửa `FirebaseAuthenticationService`:
  - không tạo counter `counters/users`.
  - không ghi field `id`.
  - document id là Firebase UID.
  - return principal/user view dựa trên UID.
- Tạo DTO/model nhẹ thay cho JPA `User` nếu cần, ví dụ `AuthenticatedUser`:
  - `uid`
  - `email`
  - `displayName`
  - `avatarUrl`
  - `role`
- Sửa controller/service signatures:
  - từ `Long userId` sang `String uid`.
  - ưu tiên sửa theo module, không sửa toàn repo một lần nếu khó review.

File chịu ảnh hưởng lớn:

- `src/main/java/com/englishwebapp/security/AppUserPrincipal.java`
- `src/main/java/com/englishwebapp/security/AuthSessionService.java`
- `src/main/java/com/englishwebapp/service/FirebaseAuthenticationService.java`
- Controllers lấy `principal.id()`.
- Services nhận `Long userId`.

Nghiệm thu:

- Login bằng Firebase vẫn tạo session.
- Account page đọc/ghi `users/{uid}`.
- Không còn logic tạo `Long id` user mới.
- Các module chưa migrate có thể tạm dùng adapter map UID nếu cần, nhưng mục tiêu cuối là xóa adapter này.

## Phase 2 - Chuyển account/profile hoàn toàn sang Firestore

Mục tiêu: account không quét toàn bộ collection users và không phụ thuộc id số.

Việc cần làm:

- Sửa `AccountService.getSettings(String uid)` đọc thẳng `users/{uid}`.
- Sửa `AccountService.updateSettings(String uid, form)` set merge vào `users/{uid}`.
- Sửa `AccountService.changePassword(String uid, form)` dùng UID.
- Bỏ mọi hàm `findUser(Long userId)` quét collection.
- Chuẩn hóa timestamp:
  - dùng `FieldValue.serverTimestamp()` nếu có thể.
  - nếu vẫn dùng millis thì nhất quán toàn app, nhưng server timestamp tốt hơn.

Nghiệm thu:

- Update display name/avatar chạy không cần SQL.
- Đổi password vẫn gọi Firebase Auth.
- Không còn query `users` toàn collection để tìm theo `id`.

## Phase 3 - Chuyển listening progress/tools sang Firestore

Mục tiêu: bỏ JPA cho các bảng listening.

SQL cần thay:

- `listening_progress`
- `listening_notes`
- `listening_favorites`
- `listening_vocab_basket`

Việc cần làm:

- Tạo Firestore adapter/service nội bộ, ví dụ:
  - `ListeningProgressStore`
  - `ListeningToolStore`
- Sửa `ListeningProgressService`:
  - `summarize(uid, part, level)` query `users/{uid}/listeningProgress` với `part` và `level`.
  - `record(uid, request)` set doc theo `questionId`.
  - `resetLevel(uid, part, level)` xóa docs thuộc part/level hoặc dùng batch.
- Sửa `ListeningToolService`:
  - `saveNote` set `users/{uid}/listeningNotes/{itemId}`.
  - `toggleFavorite` get/delete/set `users/{uid}/listeningFavorites/{itemId}`.
  - `addVocab` add doc vào `users/{uid}/listeningVocabBasket`.
  - `resetLevel` gọi Firestore store, không gọi repository.
- Không cần load `User` entity để gán quan hệ.

Index Firestore có thể cần:

- Collection group hoặc subcollection query `listeningProgress` theo `part`, `level`.
- Nếu query nằm dưới `users/{uid}/listeningProgress`, single-field index mặc định thường đủ cho filter đơn giản; kiểm tra runtime link tạo index nếu Firestore yêu cầu composite.

Nghiệm thu:

- Làm 1 câu listening xong refresh vẫn thấy progress.
- Dashboard/list level hiển thị `done/correct/wrong`.
- Toggle favorite đúng 2 trạng thái.
- Save note ghi đè cùng item.
- Add vocab tạo record mới.
- Reset level xóa progress đúng part/level.

## Phase 4 - Chuyển reading progress/tools sang Firestore

Mục tiêu: bỏ JPA cho các bảng reading.

SQL cần thay:

- `reading_progress`
- `reading_notes`
- `reading_favorites`
- `reading_vocab_basket`

Việc cần làm:

- Làm giống Phase 3 nhưng với:
  - `ReadingProgressService`
  - `ReadingToolService`
- Schema:
  - `users/{uid}/readingProgress/{questionId}`
  - `users/{uid}/readingNotes/{itemId}`
  - `users/{uid}/readingFavorites/{itemId}`
  - `users/{uid}/readingVocabBasket/{autoId}`
- Giữ validation hiện tại:
  - reading part 5-7
  - level 1-5
  - `itemId` và `questionId` bắt buộc cho progress.

Nghiệm thu:

- Làm 1 câu reading xong refresh vẫn thấy progress.
- Reset level không ảnh hưởng level khác.
- Notes/favorites/vocab hoạt động giống trước.

## Phase 5 - Chuẩn hóa VocabService Firestore

Mục tiêu: phần vocab đã ở Firestore nhưng cần bỏ `Long userId` và counter-user legacy.

Việc cần làm:

- Đổi các method nhận `Long userId` sang `String uid`.
- Với personal set/folder:
  - thêm field `ownerUid`.
  - không dùng `createdById`.
  - nếu cần hiển thị owner, lưu `ownerName`.
- Với `userVocabProgress`:
  - chuyển từ collection top-level có `userId` sang `users/{uid}/vocabProgress/{wordId}`.
- Với set/word/folder id:
  - có thể giữ counter cho content id nếu muốn URL số không đổi.
  - nếu không cần URL số, chuyển sang auto id/string id.
- Tối ưu dần các hàm đang đọc toàn collection:
  - `publishedSets()` có thể query `status == PUBLISHED` và `deletedAt == null`.
  - `wordsForSet(setId)` query `setId == ...`.
  - `progressForUser(uid)` đọc subcollection user thay vì scan top-level.

Nghiệm thu:

- Tạo set cá nhân.
- Tạo folder, rename, share, copy community.
- Import/add word.
- Review vocab cập nhật progress.
- Dashboard vocab không cần SQL.

## Phase 6 - Chuyển practice/mock test theo hướng không lưu content SQL

Mục tiêu: nếu nội dung lấy từ `dautoeic.com`, SQL chỉ còn lịch sử cá nhân thì chuyển lịch sử cá nhân sang Firestore.

Quyết định trước khi code:

- Nếu practice page hiện dùng local `tests/questions`, thay data source bằng `DauToeicClientService`.
- Nếu một số bài practice vẫn phải giữ custom content, lưu custom content trong Firestore hoặc tạm tắt route đó.

SQL cần thay hoặc bỏ:

- `tests`
- `test_questions`
- `question_groups`
- `questions`
- `answer_options`
- `accepted_answers`
- `draft_answers`
- `user_attempts`
- `user_answers`

Việc cần làm:

- Tách `PracticeQueryService` thành:
  - content reader từ `dautoeic.com` hoặc Firestore content.
  - user state store Firestore.
- Sửa `PracticeSubmissionService`:
  - `saveDraft(uid, testId, payload)` set `users/{uid}/practiceDrafts/{testId}`.
  - `submit(uid, testId, request)` lấy câu/đáp án từ data source mới, chấm điểm, add `practiceAttempts`.
  - xóa draft sau submit.
  - cập nhật leaderboard/summary nếu còn dùng.
- Sửa `getHistory(uid, pageable)` query `users/{uid}/practiceAttempts` order by `submittedAt desc`.
- Sửa `getAttemptReview(attemptId, uid)` đọc attempt doc và render answers đã lưu.
- Nếu bỏ mock test local:
  - remove/disable question bank/admin/contribution flows liên quan.

Nghiệm thu:

- Vào practice list/session không cần SQL.
- Save draft, refresh, draft còn.
- Submit bài, có score.
- History hiện attempt mới.
- Review attempt hiện câu trả lời đã lưu.

## Phase 7 - Hub/Dashboard không dùng repository SQL

Mục tiêu: home/hub/dashboard đọc Firestore và API ngoài.

Việc cần làm:

- Sửa `DashboardService`:
  - completed tests: đếm `practiceAttempts`.
  - average score: tính từ attempts hoặc lưu summary.
  - mastered words: từ `users/{uid}/vocabProgress`.
  - recent attempts: query `practiceAttempts` order desc limit 7.
- Sửa `HubService`:
  - user profile từ `users/{uid}`.
  - today completed từ attempts/progress hôm nay.
  - total tests/questions/words:
    - nếu lấy từ `dautoeic.com`, dùng API count nếu có.
    - nếu không có, hiển thị fallback hoặc ẩn metric.
    - vocab words từ Firestore.
- Không inject `UserRepository`, `UserAttemptRepository`, `QuestionRepository`, `TestRepository`, `VocabWordRepository`.

Nghiệm thu:

- Home/hub render không lỗi khi không có SQL.
- Dashboard metric hợp lý hoặc được ẩn nếu data source ngoài không có count.

## Phase 8 - Community, billing, AI writing

Mục tiêu: các tính năng phụ không giữ SQL sống sót.

Community:

- Nếu giữ:
  - comments vào Firestore.
  - leaderboard vào `leaderboards/{period}/entries/{uid}`.
  - `CommunityService.addScore` transaction increment score.
- Nếu chưa cần:
  - controller trả page đơn giản hoặc 404 feature disabled.
  - bỏ repository SQL.

Billing:

- Nếu payment chưa thật:
  - lưu subscription/transactions mock dưới `users/{uid}` hoặc tắt.
- Nếu payment thật sau này:
  - webhook vẫn cần backend, nhưng backend ghi Firestore.

AI writing:

- `AiWritingService` ghi `users/{uid}/aiWritingJobs`.
- History query limit 20 theo `createdAt desc`.

Media:

- `MediaStorageService` hiện lưu metadata SQL qua `MediaAssetRepository`.
- Nếu không còn admin/upload media local, tắt upload metadata.
- Nếu vẫn cần upload:
  - file có thể để local/S3/Firebase Storage.
  - metadata vào `mediaAssets/{assetId}` Firestore.

Nghiệm thu:

- Không còn service phụ nào inject JPA repository.
- Các route phụ hoặc hoạt động bằng Firestore, hoặc được tắt rõ ràng.

## Phase 9 - Xóa admin/content management cũ

Mục tiêu: vì hiện không còn làm admin, không để admin giữ lại toàn bộ SQL.

Ứng viên xóa/tắt:

- `AdminController`
- `QuestionBankService`
- `QuestionPublishValidator`
- `LearnerContentService` nếu chỉ phục vụ content local.
- `ContributionController`/`UserQuestionController` nếu là flow tạo câu hỏi nội bộ.
- Templates `templates/admin/*` nếu không dùng.
- Repositories/entities content cũ nếu không còn route nào cần.

Cách làm an toàn:

- Bước 1: ẩn link admin khỏi UI.
- Bước 2: disable route bằng config hoặc remove controller.
- Bước 3: xóa service/repository/entity không còn reference.
- Bước 4: chạy compile/test để biết còn import sót.

Nghiệm thu:

- Không còn endpoint admin/content cũ trong app.
- Không còn dependency từ public app vào SQL content.

## Phase 10 - Dọn JPA/Flyway/datasource khỏi production

Mục tiêu: app boot không cần SQL.

Việc cần làm:

- Xóa khỏi `pom.xml`:
  - `spring-boot-starter-data-jpa`
  - `mysql-connector-j`
  - `postgresql`
  - `flyway-core`
  - `flyway-mysql`
  - `flyway-database-postgresql`
  - `h2` nếu test không còn cần.
- Xóa khỏi `application.yml`:
  - `spring.jpa`
  - `spring.flyway`
  - datasource profile references.
- Xóa/để archive:
  - `src/main/resources/db/migration/mysql`
  - `src/main/resources/db/migration/postgresql`
- Xóa package JPA nếu không còn dùng:
  - `entity`
  - `repository`
  - hoặc chỉ giữ enum/model nào còn cần bằng cách chuyển sang package `model`.
- Sửa tests:
  - bỏ `@DataJpaTest` nếu có.
  - mock Firestore store hoặc dùng emulator/test double.

Nghiệm thu:

- `mvn test` pass.
- `mvn spring-boot:run` boot khi không có `DATABASE_URL`.
- Deploy Railway/Vercel không cần DB env.
- Logs không có Hibernate/Flyway startup.

## Phase 11 - Migration dữ liệu cũ nếu cần

Nếu production đã có dữ liệu SQL cần giữ, làm migration một lần. Nếu dữ liệu cũ không quan trọng, bỏ phase này.

Thứ tự migrate:

1. users -> `users/{firebaseUid}`
2. listening/reading progress -> subcollection dưới user
3. notes/favorites/vocab basket -> subcollection dưới user
4. user attempts/drafts -> subcollection dưới user
5. vocab personal sets/progress nếu có SQL legacy
6. billing/community/AI writing nếu cần

Script migration:

- Dùng Java command runner hoặc script riêng.
- Đọc SQL theo batch.
- Ghi Firestore theo batch tối đa 500 writes/batch.
- Ghi log mapping và lỗi.
- Chạy dry-run trước.
- Chạy idempotent bằng doc id ổn định.

Nghiệm thu:

- Đếm số record source/target.
- Lấy vài user thật kiểm tra thủ công.
- App chạy bằng Firestore với dữ liệu migrated.

## Phase 12 - Security Rules và indexes

Security Rules đề xuất:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isOwner(uid) {
      return signedIn() && request.auth.uid == uid;
    }

    match /users/{uid} {
      allow read, update: if isOwner(uid);
      allow create: if isOwner(uid);

      match /{subcollection}/{docId} {
        allow read, write: if isOwner(uid);
      }
    }

    match /vocabSets/{setId} {
      allow read: if resource.data.status == 'PUBLISHED';
      allow write: if false;
    }

    match /vocabWords/{wordId} {
      allow read: if true;
      allow write: if false;
    }

    match /vocabFolders/{folderId} {
      allow read: if resource.data.publicShared == true;
      allow write: if false;
    }

    match /leaderboards/{period}/entries/{uid} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

Ghi chú:

- Nếu chỉ backend Spring ghi Firestore bằng Admin SDK, rules chủ yếu bảo vệ client direct access.
- Nếu frontend ghi trực tiếp Firestore sau này, rules phải chặt hơn theo từng field.
- Public vocab personal/shared cần rules riêng nếu cho user tạo/cập nhật trực tiếp từ client.

Indexes có thể cần:

- `users/{uid}/practiceAttempts`: `submittedAt desc`
- `users/{uid}/aiWritingJobs`: `createdAt desc`
- `users/{uid}/listeningProgress`: `part asc`, `level asc`
- `users/{uid}/readingProgress`: `part asc`, `level asc`
- `leaderboards/{period}/entries`: `score desc`
- `vocabSets`: `status`, `deletedAt`, `updatedAt`
- `vocabWords`: `setId`, `status`, `deletedAt`

## Thứ tự triển khai khuyến nghị

1. Phase 1-2: identity/account theo UID.
2. Phase 3: listening Firestore.
3. Phase 4: reading Firestore.
4. Phase 5: vocab bỏ `Long userId`.
5. Phase 7: hub/dashboard.
6. Phase 6: practice, vì phần này đụng content/query nhiều hơn.
7. Phase 8: community/billing/AI/media.
8. Phase 9: xóa admin/content cũ.
9. Phase 10: xóa JPA/Flyway/datasource.
10. Phase 11-12: migrate dữ liệu cũ và chốt rules/indexes.

Lý do không bắt đầu bằng xóa dependency:

- Hiện nhiều service còn compile dựa vào repository/entity.
- Nếu xóa JPA trước, app sẽ vỡ trên diện rộng và khó kiểm tra từng module.
- Cách chắc hơn là chuyển từng module sang Firestore, test xong mới dọn dependency.

## Phân công song song: Codex và qwen37.max

Mục tiêu phân công là để 2 agent làm song song nhưng ít sửa chồng cùng file. Các phase có dependency phải được làm theo wave, nhưng trong từng wave có thể chạy cùng lúc.

### Quy tắc phối hợp

- Mỗi agent làm trên branch riêng hoặc worktree riêng.
- Không cùng sửa một file trong cùng wave, trừ khi đã báo trước.
- Cuối mỗi wave phải ghi lại:
  - files đã sửa.
  - route/flow đã test.
  - test command đã chạy.
  - phần còn rủi ro.
- Luôn merge theo thứ tự:
  1. Codex merge identity/shared contracts trước.
  2. qwen37.max rebase/merge theo contracts mới.
  3. Codex làm integration pass cuối wave.
- DTO response và template/JS public nên giữ nguyên shape tối đa để giảm conflict.
- Nếu cần đổi method signature dùng user id, đổi thẳng sang `String uid`, không tạo thêm legacy `Long userId` mới.

### Wave 1 - Nền identity và storage contracts

Codex phụ trách:

- Phase 1: đổi identity từ `Long userId` sang Firebase UID.
- Phase 2: chuyển account/profile hoàn toàn sang Firestore theo UID.
- Tạo convention chung cho Firestore store:
  - helper `await`.
  - helper path `users/{uid}/...`.
  - timestamp convention.
  - exception mapping khi Firestore lỗi.
- Sửa controllers lấy `AppUserPrincipal.firebaseUid()` thay vì `id()` cho các flow đang được migrate trước.

qwen37.max phụ trách song song:

- Audit các controller/service đang gọi `principal.id()` và lập danh sách file cần đổi theo module.
- Chuẩn bị test plan cho listening/reading:
  - record progress.
  - summarize.
  - reset level.
  - save note.
  - toggle favorite.
  - add vocab basket.
- Tạo skeleton store nếu không đụng file Codex đang sửa:
  - `FirestoreListeningStore`
  - `FirestoreReadingStore`
  - model record/map helper riêng cho progress/tool docs.

Điểm chặn:

- qwen37.max không merge thay đổi service signature chính trước khi Codex chốt `AppUserPrincipal` và convention UID.

### Wave 2 - Reading/listening user data

Codex phụ trách:

- Review integration của store contracts.
- Sửa các controller endpoint liên quan nếu cần để truyền `String uid`.
- Kiểm tra flow auth/session sau khi listening/reading bắt đầu dùng UID.

qwen37.max phụ trách:

- Phase 3: chuyển listening progress/tools sang Firestore.
- Phase 4: chuyển reading progress/tools sang Firestore.
- Xóa dependency JPA khỏi các service này:
  - `ListeningProgressService`
  - `ListeningToolService`
  - `ReadingProgressService`
  - `ReadingToolService`
- Viết hoặc sửa test cho 4 service trên bằng mock store/test double.

Nghiệm thu wave:

- Listening làm bài, refresh vẫn có progress.
- Reading làm bài, refresh vẫn có progress.
- Reset level đúng part/level.
- Note/favorite/vocab basket hoạt động.
- Không còn repository listening/reading được inject vào service production.

### Wave 3 - Vocab và dashboard

Codex phụ trách:

- Phase 5: chuẩn hóa `VocabService` sang UID.
- Chuyển `userVocabProgress` sang `users/{uid}/vocabProgress/{wordId}` hoặc chuẩn bị adapter tương thích tạm thời.
- Tối ưu các query vocab dễ tốn chi phí nhất:
  - progress theo user.
  - words theo set.
  - personal sets/folders theo owner UID.

qwen37.max phụ trách song song:

- Phase 7: chuyển `DashboardService` và phần không phụ thuộc vocab sâu sang Firestore/API ngoài.
- Sửa `HubService` để không còn phụ thuộc SQL repository cho metric không thiết yếu.
- Ẩn hoặc fallback các metric không có nguồn dữ liệu từ `dautoeic.com`.

Điểm cần tránh conflict:

- Codex giữ quyền sửa chính `VocabService`.
- qwen37.max không sửa logic vocab sâu trong cùng wave, chỉ gọi public method đã được Codex chốt.

### Wave 4 - Practice/mock test

Codex phụ trách:

- Phase 6: thiết kế và chuyển practice core:
  - content reader từ `dautoeic.com` hoặc Firestore content.
  - `practiceDrafts`.
  - `practiceAttempts`.
  - submit/grading/history/review.
- Quyết định route practice nào giữ, route nào tắt nếu còn phụ thuộc SQL content cũ.

qwen37.max phụ trách song song:

- Chuẩn bị UI/template compatibility cho practice:
  - session page vẫn nhận DTO cũ nếu có thể.
  - history/review render từ attempt Firestore.
- Viết test case cho:
  - save draft.
  - submit attempt.
  - delete draft after submit.
  - history order by `submittedAt desc`.

Điểm chặn:

- qwen37.max không tự đổi schema attempt nếu Codex chưa chốt document shape.

### Wave 5 - Tính năng phụ và xóa admin cũ

Codex phụ trách:

- Integration review toàn app.
- Chốt route còn giữ/tắt.
- Kiểm tra security/session không còn dùng `Long userId`.

qwen37.max phụ trách:

- Phase 8:
  - community Firestore hoặc tắt route.
  - billing Firestore hoặc tắt route.
  - AI writing Firestore.
  - media metadata Firestore hoặc tắt upload metadata.
- Phase 9:
  - xóa/tắt admin/content management cũ.
  - remove references tới question bank/content local nếu practice đã chuyển qua `dautoeic.com`.

Nghiệm thu wave:

- Public app không còn link admin.
- Tính năng phụ không giữ SQL dependency.
- Không còn service phụ inject JPA repository.

### Wave 6 - Dọn dependency và final hardening

Codex phụ trách:

- Phase 10: xóa JPA/Flyway/datasource khỏi `pom.xml` và config.
- Xóa hoặc chuyển package `entity`/`repository` còn sót.
- Final compile/test.
- Integration pass trên các flow chính bằng browser nếu có dev server.

qwen37.max phụ trách song song:

- Phase 11: chuẩn bị script/checklist migration dữ liệu cũ nếu cần.
- Phase 12: soạn Firestore indexes/security rules bản cuối.
- Audit bằng grep:
  - `JpaRepository`
  - `jakarta.persistence`
  - `spring.jpa`
  - `spring.flyway`
  - `principal.id()`
  - `Long userId`

Nghiệm thu cuối:

- App boot không cần datasource SQL.
- Logs không còn Hibernate/Flyway.
- `mvn test` pass hoặc các test fail được ghi rõ lý do.
- `changedb.md` được cập nhật nếu implementation thực tế khác plan.

## Checklist hoàn tất toàn bộ

- Không còn `import com.englishwebapp.repository` trong code production.
- Không còn `import jakarta.persistence` trong code production.
- Không còn `@Entity`, `@Table`, `JpaRepository`.
- Không còn `@Transactional` chỉ để phục vụ JPA. Firestore transaction dùng API riêng.
- Không còn `spring.jpa`, `spring.flyway`, datasource SQL trong config production.
- Không còn migration SQL được load khi boot.
- Login/logout/account hoạt động.
- Listening/reading progress hoạt động.
- Notes/favorites/vocab basket hoạt động.
- Vocab cá nhân/progress hoạt động.
- Practice draft/submit/history/review hoạt động nếu còn bật feature.
- Hub/dashboard không lỗi khi không có SQL.
- Deploy không khai báo database vẫn chạy.

## Rủi ro cần kiểm soát

- Firestore không query linh hoạt như SQL. Cần thiết kế theo màn hình đọc dữ liệu.
- Query scan toàn collection sẽ tốn tiền và chậm. Cần chuyển dần sang query có filter hoặc subcollection theo user.
- Document limit khoảng 1 MiB. Không nhồi quá nhiều answers/history vào một document user tổng.
- Batch write giới hạn 500 writes/batch.
- Không có join. Những field cần hiển thị ở history/review nên denormalize vào attempt.
- Nếu backend dùng Admin SDK, Firestore rules không chặn backend. Phải validate quyền trong service bằng UID từ session.
- Nếu sau này frontend ghi trực tiếp Firestore, rules phải được thiết kế lại chi tiết hơn.

## Ghi chú triển khai code

- Nên tạo lớp store/adapter Firestore nhỏ trước khi sửa service lớn:
  - `FirestoreUserStore`
  - `FirestoreListeningStore`
  - `FirestoreReadingStore`
  - `FirestorePracticeStore`
  - `FirestoreCommunityStore`
- Service nghiệp vụ nên không gọi Firestore API rải rác quá nhiều nơi.
- DTO response giữ nguyên càng nhiều càng tốt để không phải sửa template/JS cùng lúc.
- Với mỗi phase, chạy test module tương ứng trước rồi mới chuyển phase sau.
- Sau mỗi phase nên kiểm tra bằng trình duyệt các flow chính, vì app có Thymeleaf + JS.
## Trang thai implementation 2026-07-03

Da thuc hien migration chinh trong repo:

- Wave 1-2: identity chinh la Firebase UID; account/profile doc `users/{uid}`; session khong bat buoc `Long userId`.
- Wave 2-4 phan qwen: listening/reading progress, note, favorite, vocab basket da chuyen sang `users/{uid}/...` qua Firestore store.
- Wave 3: vocab service dung `String uid`; progress ghi `users/{uid}/vocabProgress/{wordId}`; personal set/folder moi ghi `ownerUid`.
- Wave 4: practice core dung `DauToeicClientService` lam content reader; draft/attempt ghi Firestore `users/{uid}/practiceDrafts` va `users/{uid}/practiceAttempts`.
- Wave 5: dashboard/hub/community/billing/AI/media khong con repository SQL; admin/content/question-bank/lesson SQL cu duoc tat hoac tra empty/disabled.
- Wave 6: da xoa JPA repositories, Flyway migrations, datasource config, database drivers, Flyway, H2 test dependency; entity package chi con POJO/model de giu shape template/DTO.
- Qwen Wave 6 artifacts: `firestore.rules`, `firestore.indexes.json`, `docs/sql-to-firestore-migration-checklist.md`.

Test da chay:

- `.\mvnw.cmd clean test` pass sau khi go JPA/Flyway.

Audit cuoi:

- Khong con `import com.englishwebapp.repository` trong `src/main/java`/`src/test/java`.
- Khong con `JpaRepository`, `jakarta.persistence`, `@Entity`, `@Table`.
- Khong con `spring.jpa`, `spring.flyway`, `datasource`, `mysql`, `postgresql`, `h2database` trong `pom.xml`, `src/main/java`, `src/main/resources`, `src/test/java`.
- Khong con `principal.id()` hoac `user.id()` trong production code.

Ghi chu con lai:

- Practice route van dung numeric route id de giu URL/template cu; `DauToeicPracticeContentService` map id ngoai sang numeric id on dinh bang parse/CRC32.
- Admin va lesson local cu da tat, khong migrate noi dung SQL cu.
- Neu can media upload metadata sau nay, nen them Firestore collection `mediaAssets/{assetId}`; hien service luu file local va tra response truc tiep.
