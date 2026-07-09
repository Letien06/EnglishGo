# Plan tong the toi uu va tinh nang EnglishWebApp

Ngay lap: 2026-07-09

Pham vi: ke hoach san pham va ky thuat cho cac phan da duyet, de sau nay code theo tung phase ro rang. Tai lieu nay chua yeu cau sua source code ngay.

## 0. Quyet dinh san pham

- Bo han module Billing. Khong can subscription, checkout, giao dich, Premium gating trong giai doan nay.
- Uu tien app nhanh, on dinh, hoc that du lieu that.
- Them tinh nang moi theo huong tang gia tri hoc: draft bai thi dong bo server, lich su hoc vocab server-side, dashboard ca nhan hoa, phan tich diem yeu, reminder/on tap SRS.
- Truoc khi them nhieu tinh nang, phai sua cac loi test/lint dang co de giu nen code sach.

## 1. Server-side draft cho bai thi co lam load cham hon khong?

Neu lam sai thi co the cham. Neu lam dung thi khong nen lam cham man vao bai thi.

Nguyen tac thiet ke:

- Local draft van la duong nhanh nhat: khi vao session, client doc `localStorage` ngay de render cau tra loi da co.
- Server draft chi la dong bo va backup: load sau khi man hinh da hien, hoac server tra kem draft nho neu request dang co san.
- Khong block render bai thi de doi draft server tru khi khong co local draft.
- Autosave server phai debounce 5-10 giay, gui nen, khong hien overlay, khong lam nut/scroll bi dung.
- Draft payload chi luu phan nho: answers, markedQuestionIds, currentQuestionIndex, startedAtMillis, durationMinutes, config. Khong luu lai full question/audio/image.
- API draft phai nhe: 1 doc Firestore theo session key, doc thang bang path, khong query scan.
- Khi co ca local va server draft: chon ban co `updatedAtMillis` moi hon, merge an toan, sau do cap nhat local.

Ket luan: server-side draft nen duoc lam theo mo hinh "local-first + async sync". Cach nay tang do tin cay ma khong lam load bai thi cham hon dang ke.

## 2. Phase 1 - Don dep nen tang bat buoc

### 2.1 Sua test dang fail

Hien trang:

- `npm test` fail o `web/src/lib/services/hub.test.ts`.
- Mock test van ky vong subcollection `vocabProgress`, trong khi service that da dung `userVocabProgress`.
- `getHub()` co fallback `getStudyStreak()` nen test mock can ho tro subcollection `studyActivity` hoac mock summary streak.

Viec can lam:

1. Cap nhat mock trong `hub.test.ts` de dung `userVocabProgress`.
2. Mock `studyActivity` hoac mock `getStoredStudyStreakSummary`.
3. Dam bao test xac nhan:
   - greetingName dung.
   - completedTests dung.
   - averageScore dung.
   - masteredWords dung.
   - streak/dailyGoal khong bi crash khi co summary.

Acceptance:

- `npm test` pass.

### 2.2 Sua lint dang fail

Hien trang:

- `ListenPracticeClient.tsx`: `setActiveMode()` va `setActiveAssist()` trong effect bi rule `react-hooks/set-state-in-effect`.
- `ReadPracticeClient.tsx`: `setActiveMode()` trong effect bi rule tuong tu.
- `ThemeToggle.tsx`: `setTheme(readTheme())` trong effect bi rule tuong tu.
- Co mot so warning `<img>` va unused function trong vocab page, chua phai blocker nhung nen xu ly.

Huong lam:

- Voi practice mode/assist: dung state initializer theo prop, va neu prop thay doi do route remount thi uu tien key/remount hoac tinh derived value thay vi sync state bang effect.
- Voi ThemeToggle: khoi tao theme bang lazy initializer an toan client, hoac dung mounted flag/inline script da co trong layout de tranh hydration mismatch.
- Xoa/bo cac function khong con dung trong `vocab/page.tsx` neu da chuyen sang client components.

Acceptance:

- `npm run lint` pass, chi chap nhan warning neu co ly do ro.

## 3. Phase 2 - Bo han Billing

Muc tieu: xoa hoac vo hieu hoa toan bo billing de app khong co luong thanh toan gia.

Pham vi can tim/xu ly:

- Route UI:
  - `/billing`
  - Link/menu billing trong sidebar/topbar neu co.
- API:
  - `/api/billing/checkout`
- Service:
  - `web/src/lib/services/billing.ts`
- Types/doc/nav:
  - Moi text lien quan plan, subscription, Premium, transaction.
- Middleware:
  - Bo `/billing` khoi protected prefixes neu route bi xoa.
- README/docs:
  - Cap nhat Main Routes, bo billing.

Lua chon trien khai:

- Uu tien xoa route/page/API/service neu khong con tham chieu.
- Neu can giu duong dan cu de tranh 404 dot ngot, redirect `/billing` ve `/account` hoac `/hub` trong 1 release, sau do xoa han.

Acceptance:

- Khong con nut/link Billing trong UI.
- Truy cap `/billing` khong hien man thanh toan.
- Khong con API nao co the tu ghi `PAID`/`ACTIVE`.
- `rg "billing|checkout|subscription|transaction|Premium|PREMIUM"` chi con ket qua hop ly trong docs migration neu can.
- `npm test`, `npm run lint`, `npm run build` pass.

## 4. Phase 3 - Server-side draft bai thi local-first

Muc tieu: bai dang lam khong mat khi doi may/browser, nhung van vao bai nhanh.

Data model de xuat:

```text
users/{uid}/practiceDrafts/{draftId}
```

`draftId` nen la hash/on dinh tu:

```text
testId + mode + parts + durationMinutes
```

Fields:

```json
{
  "testId": 123,
  "mode": "exam",
  "parts": [1, 2, 3, 4, 5, 6, 7],
  "durationMinutes": 120,
  "startedAtMillis": 123,
  "updatedAtMillis": 456,
  "currentQuestionIndex": 10,
  "answers": {
    "101": { "selectedOptionId": 1011, "textResponse": null }
  },
  "markedQuestionIds": [101, 110],
  "status": "ACTIVE"
}
```

API de xuat:

- `GET /api/practice/tests/{testId}/draft?mode=&parts=&time=`
  - Doc 1 doc theo draftId.
  - Tra ve null neu khong co.
- `PUT /api/practice/tests/{testId}/draft`
  - Upsert draft.
  - Validate config va answers nam trong cau hoi cua session.
- `DELETE /api/practice/tests/{testId}/draft?mode=&parts=&time=`
  - Xoa khi user lam lai hoac submit thanh cong.

Client flow:

1. Render session bang local draft neu co.
2. Goi GET draft server sau render.
3. Neu server moi hon local thi apply/merge va cap nhat local.
4. Khi user chon dap an/mark/navigation, cap nhat local ngay.
5. Debounce PUT server 5-10 giay hoac khi page hidden/beforeunload.
6. Truoc submit: flush draft server/local mot lan, sau do submit.
7. Submit thanh cong: xoa local draft va DELETE server draft.

Toi uu performance:

- Khong lay draft server bang query collection; doc theo doc id.
- Khong ghi moi cau neu user click lien tuc; debounce.
- Khong upload question content.
- Gioi han payload answers theo session.
- Co retry nen khi save loi, khong chan nguoi dung lam bai.

Acceptance:

- Reload khong mat cau tra loi.
- Doi browser/may van tiep tuc bai dang lam sau login.
- Vao bai thi khong cham hon dang ke so voi truoc, vi local render truoc.
- Submit xong khong con draft cu.

## 5. Phase 4 - Lich su hoc vocab server-side

Muc tieu: lich su hoc vocab dong bo theo tai khoan, khong chi nam trong `localStorage`.

Hien trang:

- `FlashcardGame` doc/ghi `englishgo-vocab-history-{setId}` trong `localStorage`.
- Session co `session.history` nhung can dam bao Firestore la nguon chinh cho user da login.

Data model:

```text
users/{uid}/vocabStudyHistory/{historyId}
```

Fields:

```json
{
  "source": "DAUTOEIC",
  "setId": 123,
  "externalTestId": "optional",
  "externalPartId": "optional",
  "title": "ETS 2026 - Test 1 - Part 5",
  "mode": "quiz",
  "startedAtMillis": 123,
  "finishedAtMillis": 456,
  "totalWords": 20,
  "correctWords": 16,
  "wrongWords": 4,
  "accuracy": 80,
  "score": 160
}
```

API:

- `GET /api/vocab/history?setId=&limit=8`
- `POST /api/vocab/history`

Client flow:

- User da login: ghi Firestore khi bam `Luu & Hoan thanh`.
- Guest/fallback: van dung localStorage.
- Khi load game menu: doc server history truoc, fallback localStorage neu rong/loi.

Acceptance:

- Doi may van thay lich su hoc.
- History hien dung 8 lan gan nhat.
- Ket qua game cap nhat progress va history dong bo.

## 6. Phase 5 - Dashboard ca nhan hoa that

Muc tieu: dashboard khong con nhieu so `0`/static, ma phan anh viec hoc that.

Chi so can co:

- So cau da lam hom nay theo module:
  - listening
  - reading
  - practice
  - vocab
- XP hom nay va tong XP.
- Thoi gian hoc uoc tinh.
- Streak hien tai va longest streak.
- Tu da hoc/da mastered.
- De da lam, diem trung binh, diem gan nhat.
- Muc tieu ngay va tien do tung ky nang.

Data strategy:

- Denormalize summary vao `users/{uid}` hoac `users/{uid}/dailySummaries/{dateKey}`.
- Cap nhat summary khi:
  - submit practice/listening/reading.
  - review vocab word.
  - hoan thanh vocab game.
  - record study activity.
- Dashboard doc summary nho, khong scan nhieu collection moi lan.

Acceptance:

- `/hub` render nhanh.
- So lieu hom nay thay doi sau khi hoc.
- Muc tieu ngay co y nghia va dung theo module.

## 7. Phase 6 - Phan tich diem yeu va goi y hoc tiep

Muc tieu: sau khi lam bai, user biet nen hoc gi tiep theo.

Tinh nang:

- Breakdown theo Part 1-7.
- Accuracy theo dang cau hoi neu co metadata.
- Danh sach cau sai gom:
  - part
  - topic/difficulty neu co
  - dap an user
  - dap an dung
  - giai thich neu co
- Goi y tiep theo:
  - "Luyen Part 5 level 2"
  - "On 20 tu vung lien quan"
  - "Lam lai cac cau sai"

Data:

- Luu `partBreakdown` trong attempt.
- Luu `weakAreas` summary theo user.
- Cap nhat weakAreas khi submit attempt.

Acceptance:

- Review attempt hien ro part nao yeu.
- Practice page/hub co CTA "Hoc tiep" dua tren weakAreas.
- Khong lam cham submit qua muc; neu can, tinh weakAreas nhe trong submit va tinh nang nang sau.

## 8. Phase 7 - AI Writing that bang Gemini

Hien trang:

- `ai-writing.ts` dang tao feedback heuristic bang word count/sentence count.

Muc tieu:

- Goi Gemini qua service co san.
- Cham theo rubric TOEIC Writing:
  - grammar
  - vocabulary
  - organization
  - task fulfillment
  - clarity
- Tra ve:
  - score estimate
  - loi quan trong
  - cau rewrite
  - version mau
  - next practice prompt

Can co:

- Gioi han input length.
- Rate limit theo user.
- Luu job status va feedback JSON co schema.
- Fallback heuristic neu Gemini loi.

Acceptance:

- Feedback co noi dung cu the, khong chi dem tu.
- Loi AI duoc handle ro.
- Khong lo prompt/response cua user ra public.

## 9. Phase 8 - Reminder va SRS notification

Muc tieu: tang ty le quay lai hoc.

Tinh nang:

- Badge so tu can on hom nay.
- Man progress co "Due today".
- Email/push reminder co the de phase sau; ban dau chi can in-app.
- Weekly report:
  - so ngay hoc
  - so tu mastered
  - so cau da lam
  - part tien bo/yeu.

Data:

- Dung `userVocabProgress.nextReviewAtMillis`.
- Dung daily summary/study activity da co.

Acceptance:

- User vao hub thay viec can lam hom nay.
- Vocab tab uu tien due words.

## 10. Phase 9 - Leaderboard/streak toi uu

Hien trang:

- Leaderboard streak co nguy co tinh lai `getStudyStreak()` cho nhieu user.

Huong toi uu:

- Chi doc summary tren user doc khi render leaderboard.
- Refresh summary khi `recordStudyActivity()`.
- Neu can chinh xac qua ngay moi, dung scheduled job/cron de refresh top users.
- Khong write trong request GET leaderboard neu khong bat buoc.

Acceptance:

- Leaderboard khong scan activity cua tung user trong request thuong.
- Route leaderboard on dinh khi user tang.

## 11. Phase 10 - Bao mat va van hanh

Viec can lam:

- Bo fallback hard-code `DAUTOEIC_ANON_KEY`; bat buoc dung env neu can.
- Kiem tra lai Firestore rules sau khi them draft/history:
  - User chi doc/ghi duoc draft/history cua chinh minh.
  - Admin/service route van dung Admin SDK.
- Them rate limit cho API AI va autosave neu can.
- Dam bao route admin khong chi dua vao middleware cookie, ma server page/API phai `requireRole("ADMIN")`.
- Them logging loi co context nhung khong log secret/token.

Acceptance:

- `.env.example` cap nhat day du.
- Khong co key fallback khong mong muon trong source.
- Rules deploy duoc.

## 12. Thu tu trien khai khuyen nghi

1. Sua test/lint.
2. Bo Billing hoan toan.
3. Server-side draft local-first cho bai thi.
4. Lich su hoc vocab server-side.
5. Dashboard summary ca nhan hoa.
6. Phan tich diem yeu va goi y hoc tiep.
7. AI Writing bang Gemini.
8. Reminder/SRS notification.
9. Leaderboard/streak optimization.
10. Bao mat/van hanh va do lai performance.

## 13. Lenh verify moi phase

Chay tu `web/`:

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
```

Neu phase co thay doi performance:

- Do lai cac route:
  - `/hub`
  - `/practice`
  - `/practice/session/{testId}`
  - `/vocab?tab=learn`
  - `/vocab?tab=progress`
  - `/listen`
  - `/read`
- Ghi lai ket qua vao `speed.md`.

## 14. Backlog tiep theo - toi uu frontend image va framework

Trang thai 2026-07-09: DA CODE

- Da chuyen cac `<img>` con lai sang `next/image`.
- Da them remote pattern `*.googleusercontent.com`.
- Da doi `web/src/middleware.ts` sang `web/src/proxy.ts`.
- Da them `/continue` vao route protected.

### 14.1 Doi `<img>` sang `next/image`

Hien trang:

- `npm run lint` pass nhung con warning `@next/next/no-img-element` o:
  - `web/src/app/(app)/account/AccountForms.tsx`
  - `web/src/app/(app)/listen/practice/ListenPracticeClient.tsx`
  - `web/src/app/(app)/practice/session/[testId]/PracticeSessionClient.tsx`
  - `web/src/app/(app)/read/practice/ReadPracticeClient.tsx`

Muc tieu:

- Giam LCP/bandwidth cho avatar, image cau hoi, image bai nghe/doc.
- Khong lam vo layout image cau hoi TOEIC.
- Khong lam loi remote image domain.

Viec can lam:

1. Kiem tra `next.config.ts` hien tai va them `images.remotePatterns` cho cac domain anh dang dung:
   - Firebase Storage neu co.
   - DauToeic/Supabase media host neu co.
   - Provider avatar Google neu account page dung avatar ngoai.
2. Doi image co kich thuoc biet truoc sang `next/image` voi `width`, `height`, `sizes`.
3. Voi image cau hoi co ty le khong co dinh:
   - Dung container `relative`.
   - Dung `fill` + `object-contain` neu can giu anh tron ven.
   - Hoac giu `width/height` conservative va CSS `max-h`, `object-contain`.
4. Neu mot source image la data/blob/local khong phu hop `next/image`, ghi ly do va chi disable lint cuc bo o dong do, khong disable ca file.
5. Test desktop/mobile de dam bao image khong bi crop, stretch, overlap.

Acceptance:

- `npm run lint` khong con warning `no-img-element`, tru khi co comment ly do cuc bo.
- Anh cau hoi Part 1/Practice Session hien day du, khong bi cat noi dung.
- Avatar account neu co van hien dung.
- `npm run build` pass.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm run lint
npm run build
npm run test:e2e
```

Manual/visual QA:

- Mo `/account`, xem avatar/preview.
- Mo `/listen/practice` voi item co image/audio.
- Mo `/read/practice` voi passage/item co image neu data co.
- Mo `/practice/session/{testId}` voi Part 1 hoac cau co image.
- Kiem tra viewport desktop 1365x900 va mobile 390x844.

### 14.2 Doi `middleware.ts` sang `proxy.ts`

Hien trang:

- Next build canh bao: `"middleware" file convention is deprecated. Please use "proxy" instead.`

Muc tieu:

- Het warning framework.
- Giu nguyen logic redirect auth route protected.

Viec can lam:

1. Doc tai lieu Next.js version dang dung neu can de xac nhan API `proxy.ts`.
2. Chuyen `web/src/middleware.ts` sang convention moi neu Next 16 yeu cau root `proxy.ts`/`src/proxy.ts`.
3. Giu matcher hien co:
   - Bo static files.
   - Bo `_next/static`, `_next/image`, `favicon.ico`, `api/health`.
4. Test cac route protected anonymous redirect ve `/login?from=...`.
5. Dam bao build khong con warning middleware deprecated.

Acceptance:

- Anonymous vao `/hub`, `/vocab`, `/practice`, `/listen`, `/read`, `/admin` van redirect login.
- `/`, `/login`, `/api/health` van public.
- `npm run build` khong con warning middleware/proxy deprecated.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm run build
npm run test:e2e
```

Them/doi e2e neu can:

- Test `/admin` anonymous redirect.
- Test `/api/health` khong redirect.

## 15. Backlog tiep theo - test coverage cho draft va history

Trang thai 2026-07-09: DA CODE MOT PHAN CAN THIET

- Da them unit test cho normalize practice draft payload/current index.
- Da them unit test cho `recordStudyHistory()`.
- Con nen lam sau: component test local-first draft bang React Testing Library va test API route auth/validation.

### 15.1 Unit test service practice draft

Muc tieu:

- Bao ve logic server-side draft local-first moi them.
- Dam bao payload khong luu cau hoi ngoai session.

Pham vi test:

1. `normalizeSessionConfig()`:
   - Full test parts 1-7 => mode `exam`.
   - Part 5 => mode `part`, time default/specific dung.
   - Parts duplicate/invalid duoc normalize.
2. `saveDraft()`:
   - Tao doc `users/{uid}/practiceDrafts/{sessionKey}`.
   - Giu `startedAtMillis` cu khi save lan 2.
   - Luu `currentQuestionIndex`.
   - Loai answer co `questionId` khong nam trong selected parts.
3. `getDraft()`:
   - Tra null khi khong co draft.
   - Tra payload/config dung khi co.
4. `deleteDraft()`:
   - Xoa dung doc theo session key.
5. `submit()`:
   - Submit thanh cong xoa draft.
   - Expired tinh theo `startedAtMillis` cua draft.

Acceptance:

- Co test moi trong `web/src/lib/services/practice.test.ts` hoac file rieng.
- Test khong goi DauToeic network that; mock `loadAnswerKey`/Firestore hop ly.
- `npm test` pass.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run build
```

### 15.2 Component/client test cho local-first draft

Muc tieu:

- Dam bao UI render nhanh tu localStorage va merge server draft neu server moi hon.

Pham vi:

1. LocalStorage co draft:
   - Initial answers/marked/current question dung.
   - Khong doi server truoc khi render lan dau.
2. Server draft moi hon:
   - Sau GET draft, answers/marked/current question cap nhat.
   - LocalStorage duoc ghi lai payload server.
3. Server draft cu hon:
   - Khong de server ghi de local.
4. Autosave:
   - Chon dap an ghi local ngay.
   - Debounce PUT server.
   - Visibility hidden flush save nen.
5. Submit:
   - Flush draft server truoc submit.
   - Submit success remove local draft.

Acceptance:

- Test dung React Testing Library/Vitest.
- Fake timers cho debounce.
- Mock `fetch` ro tung endpoint.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run lint
```

### 15.3 Test API vocab history

Muc tieu:

- Bao ve luong history Firestore server-side.

Pham vi:

1. `GET /api/vocab/history?setId=&limit=`:
   - Yeu cau auth.
   - Filter dung `setId`.
   - Filter dung `externalPartId` neu co.
   - Limit khong vuot gioi han service.
2. `POST /api/vocab/history`:
   - Validate input.
   - Ghi history.
   - Goi `recordStudyActivity`.
3. Flashcard page:
   - User dang nhap va `mode=menu` mac dinh van goi `getFilteredSession()` de lay history server.

Acceptance:

- Test service/API pass.
- Guest van fallback localStorage trong client game.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run build
```

## 16. Backlog tiep theo - Firestore rules va indexes

Trang thai 2026-07-09: DA CODE

- Da them indexes cho `practiceDrafts`, `vocabGameDrafts`, `vocabStudyHistory`, `rateLimits`.
- Da tighten rules de `practiceAttempts`, `vocabStudyHistory`, `rateLimits` khong bi client write qua wildcard.
- Luu y: can deploy rules/indexes bang Firebase CLI tren moi truong that.

Hien trang:

- Them/dua vao cac collection/subcollection:
  - `users/{uid}/practiceDrafts/{draftId}`
  - `users/{uid}/vocabStudyHistory/{historyId}`
  - `users/{uid}/dailySummaries/{dateKey}`
  - `users/{uid}/aiWritingJobs`
- Firestore rules dang cho `users/{uid}/{subcollection}/{docId}` owner read/write, nen user-owned subcollection duoc bao ve co ban.
- Mot so query co the can index neu production data lon.

Muc tieu:

- Khong gap `FAILED_PRECONDITION: The query requires an index` tren production.
- Rules ro rang, khong mo qua rong neu sau nay co client SDK ghi truc tiep.

Viec can lam:

1. Audit query moi:
   - `aiWritingJobs.where(createdAtMillis >= todayStart).count()`
   - `vocabStudyHistory.orderBy(finishedAtMillis desc).limit(100)`
   - `practiceAttempts.orderBy(submittedAtMillis desc).orderBy(documentId desc)`
   - `userVocabProgress.where(status in ...).where(nextReviewAtMillis <= now).count()`
2. Cap nhat `firestore.indexes.json` neu query can composite/collection group.
3. Ranh gioi rules:
   - Giu owner-only cho `users/{uid}/practiceDrafts`.
   - Giu owner-only cho `users/{uid}/vocabStudyHistory`.
   - Giu owner-only cho `users/{uid}/dailySummaries`.
   - Neu API server-only ghi bang Admin SDK, rules khong can mo write public.
4. Chay Firebase emulator rules test neu co setup; neu chua co, them test rules toi thieu.
5. Cap nhat docs deploy indexes/rules.

Acceptance:

- `firestore.indexes.json` co index can thiet.
- `firestore.rules` khong mo public write.
- Cac route progress/history/AI khong fail do missing index tren emulator/production.

Kiem thu:

```powershell
firebase emulators:exec --only firestore "npm --prefix web test"
firebase deploy --only firestore:indexes --dry-run
firebase deploy --only firestore:rules --dry-run
```

Neu Firebase CLI khong ho tro dry-run trong moi truong hien tai, ghi ro lenh deploy can chay thu cong trong docs.

## 17. Backlog tiep theo - Trang Hoc tiep

Trang thai 2026-07-09: DA CODE

- Da them `web/src/lib/services/continue-learning.ts`.
- Da them route `/continue`.
- Da them CTA tu `/hub` sang `/continue`.
- Trang hien due vocab, practice recommendation, practice drafts gan day, vocab history gan day.

Muc tieu:

- Tao mot man hinh tap trung cac viec nen lam tiep, thay vi de Hub chi hien mot vai CTA.

Route de xuat:

```text
/continue
```

Hoac neu muon gom trong app hien co:

```text
/hub/continue
```

Data can gom:

- `dueVocabWords`: so tu can on.
- `nextPracticeRecommendation`: part yeu nhat sau lan submit gan nhat.
- Practice draft dang do:
  - Doc `users/{uid}/practiceDrafts`, limit 5, sort `updatedAtMillis desc`.
  - Hien ten test/config/time con lai neu co metadata.
- Vocab set hoc gan day:
  - Doc `vocabStudyHistory`, group theo setId, lay 3 set gan nhat.
- Listening/Reading part gan day:
  - Lay tu `studyActivity.sourceIds` hoac progress docs neu co san.

UI de xuat:

- Section "Can lam ngay":
  - On tu den han.
  - Tiep tuc bai thi dang do.
- Section "Sua diem yeu":
  - Luyen Part yeu.
  - Link review attempt gan nhat.
- Section "Hoc tiep gan day":
  - Vocab sets/parts gan day.
  - Listening/Reading level gan day.

Service de xuat:

- `web/src/lib/services/continue-learning.ts`
- Ham:
  - `getContinueLearning(uid): ContinueLearningView`
  - doc cac summary nho, khong scan lon.

Acceptance:

- Hub co link ro den trang Hoc tiep.
- Trang render nhanh, co empty state.
- Khong query scan qua 100 docs moi section.
- Neu user moi chua co data, hien goi y bat dau `/vocab`, `/practice`, `/listen`, `/read`.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run lint
npm run build
npm run test:e2e
```

E2E nen them:

- Anonymous `/continue` redirect login.
- Logged-in mock/session neu e2e co auth helper: trang hien empty state.
- Link tu `/hub` sang `/continue` hoat dong.

Manual QA:

- User co due vocab.
- User co practice draft.
- User co weak area sau submit.
- User moi khong co data.

## 18. Backlog tiep theo - Phan tich loi chi tiet theo dang cau

Trang thai 2026-07-09: DA CODE PHIEN BAN LOCAL HEURISTIC

- Da them `weakTag` vao answer docs khi submit practice.
- Da luu `practiceWeakTags` vao user doc.
- Da hien weak tag trong trang review answer.
- Con nen lam sau: classifier co unit test rieng va dung metadata DauToeic neu provider co them field topic/type.

Hien trang:

- Practice submit da luu `partBreakdown`.
- User doc co `nextPracticeRecommendation` theo part yeu nhat.

Muc tieu:

- Phan tich sau submit khong chi theo Part, ma theo dang loi de goi y dung bai luyen.

Data de xuat:

```ts
interface PracticeWeakArea {
  part: number;
  tag: string;
  total: number;
  correct: number;
  percent: number;
  lastAttemptId: number;
  updatedAtMillis: number;
}
```

Nguon tag:

- Neu DauToeic question co metadata topic/type: map truc tiep.
- Neu chua co metadata:
  - Part 5 heuristic theo text/options:
    - word form
    - tense
    - preposition
    - vocabulary
  - Part 6/7:
    - detail
    - inference
    - vocabulary-in-context
  - Listening:
    - main idea
    - detail
    - speaker intent
- Heuristic phai conservative; neu khong chac thi tag `general`.

Viec can lam:

1. Them helper `classifyPracticeQuestion(question, options?)`.
2. Khi submit, trong `answerDocs` luu tag/difficulty neu co.
3. Luu `weakAreasByTag` vao user doc hoac subcollection `practiceWeakAreas`.
4. Review page hien:
   - part breakdown.
   - top 3 dang loi.
   - CTA luyen lai.
5. Hub/Hoc tiep dung top weak tag de goi y.

Acceptance:

- Review attempt hien dang loi co du lieu.
- Neu khong classify duoc, van hien `general`, khong doan qua da.
- Submit latency khong tang dang ke; classifier phai local, khong goi AI trong submit.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run build
```

Unit tests:

- Classifier Part 5 voi cau preposition/word form/tense mau.
- Breakdown tag tinh dung total/correct/percent.
- Unknown question => `general`.

Manual QA:

- Lam/nop Part 5, review thay top weak tags.
- Lam/nop Part 7, review khong bi crash neu metadata thieu.

## 19. Backlog tiep theo - Server-side draft cho vocab game

Trang thai 2026-07-09: DA CODE

- Da them service `vocab-game-draft`.
- Da them API `GET/PUT/DELETE /api/vocab/game-draft`.
- Da them local-first restore/autosave/delete draft trong `FlashcardGame`.
- Draft server merge theo `updatedAtMillis`, local render truoc.

Muc tieu:

- Vocab game dang choi do co the tiep tuc sau reload/doi may.
- Van giu local-first de khong lam cham gameplay.

Data model:

```text
users/{uid}/vocabGameDrafts/{draftId}
```

`draftId` gom:

```text
setId + externalPartId + mode + quizMode + mastery + order + amount
```

Fields:

```json
{
  "setId": 123,
  "externalPartId": "optional",
  "mode": "quiz",
  "quizMode": "wordMeaning",
  "wordIds": [1, 2, 3],
  "currentIndex": 5,
  "answers": [],
  "score": 80,
  "attempts": 10,
  "startedAtMillis": 123,
  "updatedAtMillis": 456,
  "status": "ACTIVE"
}
```

API:

- `GET /api/vocab/game-draft?setId=&mode=&...`
- `PUT /api/vocab/game-draft`
- `DELETE /api/vocab/game-draft?setId=&mode=&...`

Client flow:

1. Khi start game: tao local draft.
2. Moi cau tra loi: update local ngay.
3. Debounce PUT server 5-10 giay.
4. Reload:
   - render local neu co.
   - GET server draft sau render, merge neu moi hon.
5. Finish:
   - Ghi progress/history.
   - DELETE draft local/server.

Acceptance:

- Reload giua game khong mat tien do.
- Doi thiet bi van tiep tuc duoc neu da sync.
- Finish xong khong hien draft cu.
- Guest van dung localStorage fallback.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run lint
npm run build
```

Component tests:

- Local-first restore.
- Server newer merge.
- Finish deletes draft.

Manual QA:

- Start quiz, tra loi vai cau, reload.
- Doi browser/login cung account, mo lai game.
- Finish game, quay lai menu khong con continue draft.

## 20. Backlog tiep theo - Offline va sync resilience

Trang thai 2026-07-09: DA CODE MOT PHAN

- Practice session da detect online/offline.
- Khi offline, draft van luu local va status hien "Offline - saved on this device".
- Khi online lai, client flush local draft len server.
- Vocab game da co local-first + debounce server draft.
- Con nen lam sau: queue chung `useOnlineStatus`, conflict prompt neu server/local cung moi, Playwright offline test.

Muc tieu:

- Khi mat mang, user van lam bai/hoc tiep; app dong bo lai khi online.

Pham vi:

- Practice session draft.
- Vocab game draft.
- Vocab review/history.

Viec can lam:

1. Them hook `useOnlineStatus`.
2. Autosave queue:
   - Neu fetch fail do network, giu payload trong local queue.
   - Khi `online` event, flush queue.
3. UI status:
   - `Offline - dang luu tren may`
   - `Dang dong bo...`
   - `Da dong bo`
4. Submit:
   - Neu offline, khong cho submit server; hien message ro.
   - Van giu draft.
5. Conflict:
   - Neu server co draft moi hon, hoi user "Dung ban tren may nay" hay "Dung ban server" neu chenh lech lon.
   - Ban dau co the chon newest wins, nhung phai ghi ro.

Acceptance:

- Tat network trong DevTools, chon dap an, reload van con local draft.
- Bat network lai, draft sync server.
- Khong co unhandled promise rejection.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run build
```

Playwright tests nen them:

- Mock route draft PUT fail, UI hien offline/pending.
- Sau khi route restore, click/trigger online flush thanh cong.

Manual QA:

- Chrome DevTools Offline cho practice session.
- Chrome DevTools Offline cho vocab game.

## 21. Backlog tiep theo - Rate limit va abuse protection

Trang thai 2026-07-09: DA CODE NEN TANG

- Da them `web/src/lib/services/rate-limit.ts` bang Firestore daily counter.
- Da ap dung cho AI Writing, practice draft autosave, vocab game draft autosave, vocab history.
- Con nen lam sau: ap dung tiep cho vocab AI preview/save, admin generate, community comments/contributions va them unit test fake clock.

Hien trang:

- AI Writing co limit 20 job/ngay/user.
- Cac API khac chua co rate limit chung.

Muc tieu:

- Bao ve Gemini quota, Firestore write cost, comment spam, autosave spam.

API can limit:

- `/api/vocab/sets/[setId]/ai-words/preview`
- `/api/vocab/sets/[setId]/ai-words/save`
- `/api/admin/generate`
- `/api/practice/tests/[testId]/draft`
- `/api/vocab/history`
- `/api/community/comments`
- `/api/community/contributions`

Thiet ke de xuat:

- Service `rate-limit.ts`.
- Firestore collection:

```text
rateLimits/{scopeKey}
```

Hoac user subcollection:

```text
users/{uid}/rateLimits/{bucket}
```

- Bucket theo minute/day tuy API:
  - AI preview: 30/day/user.
  - AI writing: 20/day/user.
  - Admin generate: 100/day/admin.
  - Draft autosave: 120/hour/session.
  - Comments: 30/day/user.

Luu y:

- Rate limit phai fail nhanh, message ro.
- Khong log prompt/secret.
- Admin co the co limit cao hon, khong unlimited neu goi Gemini.

Acceptance:

- Vuot limit tra 429 hoac BadRequest co message ro.
- Test duoc voi fake clock.
- Khong lam cham request binh thuong qua muc.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run build
```

Unit tests:

- Under limit pass.
- At/over limit fail.
- Window moi reset.
- Different user/session khong anh huong nhau.

## 22. Backlog tiep theo - Observability va structured logging

Trang thai 2026-07-09: DA CODE NEN TANG

- Da them `web/src/lib/logging.ts`.
- Da doi `withErrorHandling` sang structured error log co method/path.
- Con nen lam sau: them redaction helper/test va log latency cho DauToeic/Gemini/draft/submit.

Muc tieu:

- Khi production loi, biet loi o dau ma khong log secret/user content nhay cam.

Pham vi log:

- DauToeic API:
  - endpoint/function
  - status
  - latency
  - cache hit/miss
- Gemini:
  - feature (`ai-writing`, `vocab-preview`, `dictionary`)
  - model
  - status
  - latency
  - fallback used
- Draft:
  - save success/fail
  - payload size
  - latency
  - sessionKey hash, khong log answers day du
- Submit practice:
  - testId
  - mode/parts
  - questionCount
  - latency
  - expired
- Firestore missing index:
  - collection/query name
  - link Firebase neu error co.

Thiet ke:

- Tao helper `web/src/lib/logging.ts`:

```ts
logInfo(event, fields)
logWarn(event, fields)
logError(event, error, fields)
```

- Redact:
  - token
  - cookie
  - API key
  - prompt/essay full text
  - answer payload full text

Acceptance:

- Route handlers dung logging helper thay vi `console.error` raw cho loi quan trong.
- Khong log secret trong output.
- Loi unexpected van vao `withErrorHandling`.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run lint
npm run build
```

Unit tests:

- Redaction xoa key nhay cam.
- Error serializer khong throw voi object la.

## 23. Checklist kiem thu tong hop cho cac backlog moi

Ket qua kiem thu 2026-07-09:

- `npm test`: PASS, 6 files, 17 tests.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm run test:e2e`: PASS, 3 tests. Luu y dev server co warning allowedDevOrigins cho `127.0.0.1` khi Playwright dung host nay; test van pass.

Sau khi code bat ky phase moi nao tu 14-22, chay toi thieu:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run lint
npm run build
npm run test:e2e
```

Checklist manual bat buoc neu dung vao UI:

- Desktop 1365x900.
- Mobile 390x844.
- Anonymous route protected redirect login.
- Logged-in route render dung.
- Loading/empty/error state khong bi blank page.
- Khong co hydration error trong browser console.

Checklist performance neu dung vao draft/dashboard/practice:

- Vao `/practice/session/{testId}` van render nhanh tu local draft.
- Draft server GET/PUT khong block thao tac chon dap an.
- `/hub` khong scan collection lon; chi doc summary/count query nho.
- `/vocab/[setId]/flashcards?mode=menu` khong bi cham do history scan qua muc.

Checklist bao mat/van hanh:

- Khong them secret vao source.
- `.env.example` cap nhat neu them env moi.
- Rules/indexes cap nhat neu them collection/query moi.
- API moi co auth/role guard dung muc.
- API AI/write-heavy co rate limit hoac ly do chua can.

Checklist git truoc khi push:

```powershell
git status --short
git diff --stat
rg -n "API_KEY|SECRET|PRIVATE_KEY|eyJ" web/src .env.example web/.env.example
```

Neu push:

```powershell
git add -A
git commit -m "<message ro nghiep vu>"
git push <remote> HEAD:<branch>
```

## 24. Backlog tiep theo - BXH diem nghe, doc, de thi va luong tinh diem cong bang

Trang thai 2026-07-09: DA CODE

- Da them service leaderboard rieng cho Listening, Reading, Full exam va weekly board.
- Da luu `scope`, `eligibility`, `leaderboardScore`, `unansweredCount`, `retryIndex`, `ineligibleReason` vao practice attempt.
- Da bo luong cong don score cu trong practice submit; attempt retry khong ghi de BXH verified.
- Da cap nhat `/leaderboard`, practice history va review attempt de hien trang thai BXH.
- Da them Firestore rules/index va unit test cho scoring/eligibility.

Muc tieu:

- Co bang xep hang rieng cho:
  - Listening.
  - Reading.
  - Full exam/de thi.
  - Weekly learning points neu muon tang dong luc hoc moi ngay.
- Diem BXH phan anh nang luc that, khong phai ai lam lai cung mot de nhieu lan thi cong don vo han.
- Nguoi lam cham, can than, khong gian lan khong bi thiet vi nguoi khac spam submit/lam lai.
- Van cho phep lam lai de hoc, nhung attempt lam lai co nhan dien rieng va khong pha BXH chinh.

### 24.1 Nguyen tac san pham

- Dung thi co diem, sai hoac bo trong thi 0 diem. Khong tru diem khi sai, vi TOEIC that cung khong tru diem sai.
- Khong cong don diem raw cua moi lan lam vao BXH chinh. Neu cong don, nguoi lam nhieu lan mot de se vuot nguoi hoc nghiem tuc.
- BXH nang luc nen dua tren "best verified score" hoac "first verified score" theo tung scope, khong dua tren tong tat ca attempts.
- XP hoc tap va diem BXH phai tach nhau:
  - Diem BXH: can cong bang, chong spam, uu tien attempt hop le.
  - XP hoc tap: co the thuong nho cho viec hoc deu, xem lai cau sai, hoan thanh bai.
- Thoi gian lam bai chi nen dung lam tie-breaker, khong nen cong bonus lon. Neu cong bonus thoi gian, user co the doan nhanh de leo BXH.

### 24.2 Scope BXH de xuat

Board IDs:

```text
listening_all_time
listening_weekly
reading_all_time
reading_weekly
exam_all_time
exam_weekly
learning_xp_weekly
```

Dieu kien vao tung BXH:

- Listening:
  - Chi tinh session gom Part 1-4 hoac full Listening section.
  - Nen yeu cau coverage gan 100 cau listening neu muon BXH nghiem tuc.
  - Neu user chi lam Part 1 rieng, luu lich su va XP, nhung khong dua vao BXH Listening chinh.
- Reading:
  - Chi tinh session gom Part 5-7 hoac full Reading section.
  - Tuong tu Listening, part le chi nen vao practice history/XP.
- Full exam:
  - Chi tinh attempt mode `exam`, parts 1-7, duration chuan 120 phut hoac config duoc danh dau official.
  - Expired attempt khong vao BXH chinh.
- Weekly:
  - Reset theo tuan calendar hoac rolling 7 ngay. De don gian nen dung calendar week theo timezone app.

### 24.3 Cong thuc diem

Diem cau hoi:

```text
correct = 1
wrong = 0
unanswered = 0
rawPercent = correctCount / questionCount * 100
```

Diem hien thi theo scope:

- Listening:
  - Dung `scoreBreakdown.listening.projectedScaledScore`, thang 5-495.
  - Neu chua du full section, hien "practice score" rieng, khong eligible BXH chinh.
- Reading:
  - Dung `scoreBreakdown.reading.projectedScaledScore`, thang 5-495.
- Full exam:
  - Dung `scoreBreakdown.totalProjectedScore`, thang 10-990.
  - Neu khong co du listening va reading thi khong eligible.
- Tie-breaker:
  1. Diem scaled cao hon.
  2. Correct count cao hon.
  3. It unanswered hon.
  4. ElapsedMillis thap hon, chi dung khi cac chi so tren bang nhau.
  5. SubmittedAtMillis som hon.

Khong khuyen nghi:

- Khong tru diem cau sai.
- Khong cong bonus thoi gian vao diem chinh.
- Khong cong don diem tat ca attempts vao BXH nang luc.

### 24.4 Chinh sach lam lai cho cong bang

Co 3 loai attempt:

```text
VERIFIED
PRACTICE_RETRY
SUSPICIOUS
```

`VERIFIED`:

- Attempt dau tien hop le cua user cho mot `testId + scope + officialConfig`.
- Hoac best score cua cac de khac nhau trong cung scope.
- Khong expired.
- Thoi gian lam khong qua bat thuong.
- Payload cau tra loi duoc cham server-side bang answer key server, khong tin diem client gui len.

`PRACTICE_RETRY`:

- User lam lai cung mot test/scope sau attempt verified dau tien.
- Van luu lich su, review cau sai, tinh progress ca nhan.
- Khong ghi de BXH chinh mac dinh.
- Co the hien "personal best" trong profile, nhung label ro la retry.

`SUSPICIOUS`:

- Submit qua nhanh so voi so cau hoi.
- Nhieu attempt cung mot test trong thoi gian ngan.
- Expired nhung van submit.
- Client draft/start time bat thuong so voi server.
- Attempt loai nay khong vao BXH chinh, nhung van co the luu de user review neu khong vi pham nang.

Khuyen nghi chinh sach BXH:

- BXH chinh: tinh diem tot nhat cua moi user tren cac attempt `VERIFIED`, moi test/scope chi lay 1 attempt dau tien.
- BXH weekly: chi tinh attempt verified trong tuan, moi test/scope chi lay attempt verified dau tien trong tuan.
- Personal history: hien tat ca attempts, gom retry, de user thay tien bo.
- Personal best: co the tinh ca retry, nhung khong tron voi BXH verified.

Neu muon cho lam lai van co dong luc:

- Retry lan 2 tro di co the nhan XP giam dan:

```text
attempt 1: 100% learning XP
attempt 2: 40% learning XP
attempt 3+: 15% learning XP
```

- Diem BXH khong nhan multiplier, ma chi eligible hay khong eligible. Cach nay de giai thich va cong bang hon.

### 24.5 Data model de xuat

Luu attempt hien co:

```text
users/{uid}/practiceAttempts/{attemptId}
```

Them fields vao attempt:

```json
{
  "scope": "LISTENING|READING|EXAM|PART_PRACTICE",
  "eligibility": "VERIFIED|PRACTICE_RETRY|SUSPICIOUS",
  "officialConfig": true,
  "canonicalAttemptKey": "testId_scope_officialConfig",
  "leaderboardScore": 495,
  "leaderboardMaxScore": 495,
  "rawCorrect": 88,
  "rawTotal": 100,
  "unansweredCount": 3,
  "retryIndex": 1,
  "ineligibleReason": null
}
```

Bang best attempt theo user de query nhanh:

```text
users/{uid}/leaderboardBest/{scope}
```

Fields:

```json
{
  "scope": "LISTENING",
  "bestScore": 450,
  "bestAttemptId": 123,
  "bestTestId": 456,
  "correctCount": 88,
  "questionCount": 100,
  "elapsedMillis": 2700000,
  "updatedAtMillis": 123456789
}
```

Bang global leaderboard:

```text
leaderboards/{boardId}/entries/{uid}
```

Fields:

```json
{
  "uid": "abc",
  "displayName": "Learner",
  "email": "hidden-or-null",
  "score": 450,
  "maxScore": 495,
  "correctCount": 88,
  "questionCount": 100,
  "elapsedMillis": 2700000,
  "attemptId": 123,
  "testId": 456,
  "period": "ALL_TIME",
  "scope": "LISTENING",
  "updatedAtMillis": 123456789
}
```

Luu y privacy:

- Public leaderboard khong nen hien email day du. Uu tien displayName/avatar; email chi dung fallback da mask.

### 24.6 Luong submit va update BXH

Flow khi user submit:

1. Server nhan answers, config, testId.
2. Server load answer key va danh sach question hop le.
3. Server tinh:
   - correctCount.
   - unansweredCount.
   - partBreakdown.
   - scoreBreakdown.
   - scope.
   - leaderboardScore.
4. Server xac dinh `canonicalAttemptKey`.
5. Server dem/lays attempt truoc cua user voi cung key:
   - chua co attempt verified: attempt moi co the la `VERIFIED`.
   - da co attempt verified: attempt moi la `PRACTICE_RETRY`.
6. Server chay rule eligibility:
   - expired => ineligible.
   - elapsedMillis qua ngan => suspicious.
   - parts khong du scope => part practice.
7. Luu attempt vao `practiceAttempts`.
8. Neu `VERIFIED`, update:
   - `users/{uid}/leaderboardBest/{scope}` neu diem cao hon best hien tai.
   - `leaderboards/{boardId}/entries/{uid}` cho all-time/weekly.
9. Van update learning summary/weak areas/history cho moi attempt hop le, ke ca retry.
10. Xoa draft sau submit thanh cong.

Pseudo rule:

```ts
const score = correctCount / questionCount;
const isOfficialExam = mode === "exam" && parts.length === 7 && durationMinutes === 120;
const scope = inferScope(parts, mode);
const hasPreviousVerified = await existsVerifiedAttempt(uid, canonicalAttemptKey);

if (expired) eligibility = "SUSPICIOUS";
else if (!isEligibleScope(scope, questionCount)) eligibility = "PRACTICE_RETRY";
else if (hasPreviousVerified) eligibility = "PRACTICE_RETRY";
else eligibility = "VERIFIED";
```

### 24.7 Luong UI

Trang `/leaderboard` nen co tabs:

- Streak.
- Listening.
- Reading.
- De thi.
- Tuan nay.

Moi dong BXH nen hien:

- Rank.
- Ten/avatar.
- Diem: `450/495` hoac `890/990`.
- Correct: `88/100` hoac `176/200`.
- Thoi gian lam, neu can.
- Badge `Verified`.

Trang review attempt nen hien:

- Diem attempt.
- Eligibility:
  - `Tinh vao BXH`.
  - `Lan luyen lai - khong tinh BXH`.
  - `Khong tinh BXH do het gio/du lieu bat thuong`.
- Neu retry dat diem cao hon verified score, hien ro:
  - "Diem nay la personal best, khong tinh vao BXH chinh vi day la lan lam lai."

### 24.8 Anti-abuse muc vua phai

Khong can lam qua nang ngay tu dau, nhung nen co baseline:

- Server-only scoring, client khong gui diem.
- Server-side start time tu draft/session, khong tin startedAt client.
- Rate limit submit theo user/test.
- One active official attempt per test/scope trong mot khoang thoi gian.
- Minimum reasonable time:
  - Khong hard-block user nhanh, chi danh dau suspicious neu qua vo ly.
  - Vi du full exam 200 cau ma submit duoi 10 phut thi khong vao BXH.
- Log `eligibilityReason` de debug va giai thich cho user.
- Admin co the reclassify attempt neu can.

### 24.9 Acceptance

- Submit dung/sai tinh diem server-side dung:
  - Dung +1 raw.
  - Sai 0.
  - Bo trong 0.
- Attempt full Listening vao BXH Listening.
- Attempt full Reading vao BXH Reading.
- Attempt full exam vao BXH De thi.
- Part practice khong vao BXH chinh, nhung van vao history va weak areas.
- Lam lai cung mot de khong cong don va khong ghi de BXH verified mac dinh.
- BXH chi doc `leaderboards/{boardId}/entries`, khong scan attempts cua tat ca user.
- UI giai thich ro vi sao mot attempt co/khong tinh BXH.

### 24.10 Thu tu trien khai khuyen nghi

1. Them helper tinh `scope`, `leaderboardScore`, `eligibility`, `canonicalAttemptKey`.
2. Them unit test cho scoring/eligibility.
3. Cap nhat `submit()` de luu fields moi vao attempt.
4. Tao service `leaderboard.ts` rieng thay vi dung chung `community.addScore()`.
5. Viet update best score bang transaction de tranh race condition.
6. Cap nhat route `/leaderboard` thanh multi-tab.
7. Cap nhat review attempt de hien eligibility.
8. Them indexes/rules neu query moi can.
9. Chay test/lint/build/e2e.

Kiem thu:

```powershell
cd D:\EnglishWebApp\web
npm test
npm run lint
npm run build
npm run test:e2e
```
