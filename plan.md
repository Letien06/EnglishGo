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

## 25. Nghe-chep video (Dictation) - dac ta san pham va ke hoach trien khai

### 25.1 Quyet dinh da chot

- EnglishWebApp la web **mien phi hoan toan** cho hoc sinh/sinh vien: khong goi tra phi, khong quang cao, khong ban du lieu hay noi dung.
- Them mot muc doc lap ten **Nghe-chep** vao sidebar cua `/listen`, dat **ngay sau Part 4**.
- Nghe-chep khong phai la mot bien the cua TOEIC Part 3. Part 1-4 va route `/listen/practice` giu nguyen, tiep tuc dung du lieu DauToeic.
- Nghe-chep dung video co quyen su dung ro rang (vi du: Kurzgesagt da cap quyen; VOA; NASA; video CC BY da duoc kiem tra). Video la nguon nghe, con bai tap la transcript da duoc phep dung va tach thanh doan nho.
- MVP chi ho tro video YouTube embed. Khong tai video YouTube ve server, khong scrape transcript/caption cua video bat ky.
- Transcript chi duoc nhap tu file/nguon ma chu so huu da cho phep (SRT, VTT, transcript trang nguon, hoac ASR tren media ma app da co quyen dung).

Phan biet ro "mien phi" va "duoc phep dung": web khong thu phi giup mo rong nguon co dieu khoan non-commercial, nhung moi lesson van phai co license/permission duoc luu va kiem tra rieng. Khong dua content vao app chi vi video co the embed tren YouTube.

### 25.2 Muc tieu, pham vi MVP va cac non-goal

Muc tieu MVP:

1. Hoc vien chon mot video theo trinh do, chu de, thoi luong va nguon.
2. Video duoc chia thanh cac doan nghe 8-18 giay; hoc vien nghe mot doan, dien/chep, nhan feedback va sang doan ke tiep.
3. Co ba muc do: che 30%, che 50%, che 100% (full dictation).
4. Dang nhap thi luu tien do, hoc tiep dung doan dang do; khach van hoc duoc nhung chi luu tam trong trinh duyet.
5. Admin co the them video, transcript, mốc thoi gian va bang chung quyen dung ma khong can deploy code.

Non-goal cua MVP:

- Khong tu dong nhan link YouTube bat ky cua nguoi dung va lay transcript.
- Khong tao toan bo transcript bang AI tai runtime.
- Khong lam chuc nang ghi am/shadowing, dich AI, vocab basket, favorite, BXH ngay trong dot dau. Schema va UI phai de mo de them sau.
- Khong gan diem TOEIC hay dua ket qua Dictation vao BXH chung. Day la luyen tap ky nang, khong phai bai thi.

Quy uoc thuat ngu:

- `muc che` = phan tram tu se bi an. 30% la de nhat (hien 70% noi dung); 100% la phai go toan bo doan.
- `completed` = hoc vien dat 100% o bat ky muc che.
- `mastered` = hoc vien dat 100% o muc che 100%, khong dung hint.
- `segment` = mot doan audio co start/end/timecode va dap an; `lesson` = mot video gom nhieu segment.

### 25.3 Kien truc va route

Khong sua de nhet data Dictation vao `ListenPracticeClient`: component hien tai phu thuoc `DauToeicDifficultySession`, nhom cau hoi A/B/C/D, audio MP3 va progress theo question. Dictation co video, transcript va dap an text nen can service/UI rieng.

Route de xuat:

```text
/listen?part=part1..part4             # giu nguyen TOEIC dashboard hien tai
/listen/dictation                     # thu vien Nghe-chep
/listen/dictation/[lessonId]          # man hoc mot video

/api/dictation/lessons                # GET catalog da publish, co filter/cursor
/api/dictation/lessons/[lessonId]     # GET metadata lesson + progress, khong tra transcript day du
/api/dictation/lessons/[lessonId]/segments/[segmentId]/prompt
/api/dictation/lessons/[lessonId]/segments/[segmentId]/attempt
/api/dictation/lessons/[lessonId]/progress
/api/admin/dictation/lessons          # CRUD, admin only
/api/admin/dictation/lessons/[lessonId]/import-transcript
/api/admin/dictation/lessons/[lessonId]/publish
```

File/module du kien:

```text
web/src/types/dictation.ts
web/src/lib/services/dictation.ts
web/src/lib/services/dictation-grading.ts
web/src/lib/parsers/transcript.ts
web/src/app/(app)/listen/dictation/page.tsx
web/src/app/(app)/listen/dictation/DictationLibraryClient.tsx
web/src/app/(app)/listen/dictation/[lessonId]/page.tsx
web/src/app/(app)/listen/dictation/[lessonId]/DictationLessonClient.tsx
web/src/app/api/dictation/...
web/src/app/(app)/admin/dictation/...
```

YouTube:

- Dung YouTube IFrame Player API de `loadVideoById`, `seekTo(startSeconds)`, play/pause va dat playback rate.
- Client tu theo doi `currentTime`; khi dat `endSeconds` thi pause. Segment bat dau som hon 0.35-0.5 giay va ket thuc muon hon 0.25-0.5 giay de nguoi hoc khong bi cat am qua sat.
- Native captions phai de off trong player; transcript/hint chi hien theo state cua bai hoc.
- Neu video khong embed duoc, bi xoa hoac unavailable: hien thong bao, link mo video goc va bao loi cho admin; khong lam trang hoc crash.
- Khong dung YouTube Captions API de tai subtitle cua video cua ben khac.

### 25.4 UI thu vien `/listen/dictation` da chot

Vi tri sidebar trong `src/app/(app)/listen/page.tsx`:

```text
Part 1: Hinh anh
Part 2: Hoi - Dap
Part 3: Hoi thoai ngan
Part 4: Doc thoai
Nghe-chep                         <- moi
```

Desktop wireframe:

```text
Breadcrumb: Ky nang Nghe / Nghe-chep
H1: Luyen nghe - chep theo video
Subcopy: Nghe tung doan ngan, tu de den full dictation.

[ Hoc tiep: thumbnail | ten video | B2 | 14/42 doan | Nut Hoc tiep ]

[ Tim bai hoc........................................................ ]
[ Tat ca cap do v ] [ Tat ca chu de v ] [ Thoi luong v ] [ Nguon v ]

Noi bat
[card] [card] [card] [card]

Daily English
[card] [card] [card] [Xem them]

Science & Technology
[card] [card] [card] [Xem them]
```

Thu tu uu tien tren mobile:

1. Nut `Hoc tiep` neu co progress.
2. Thanh tim kiem va filter dang bottom sheet.
3. Card dang 1 cot; khong dung carousel ngang bat buoc keo.
4. Moi category hien toi da 4 card va nut `Xem tat ca`.

Card lesson bat buoc co:

- thumbnail theo URL duoc phep dung;
- badge CEFR: A2/B1/B2/C1;
- tieu de toi da 2 dong;
- `Nguon · thoi luong · N doan` (vi du: `Kurzgesagt · 13 phut · 51 doan`);
- topic; trang thai `Chua bat dau`, `Dang hoc 14/51`, hoac `Da thanh thao`;
- attribution nho va clickable link den video goc;
- khong dung logo cua nguon neu license/permission khong cap quyen dung logo.

Filter da chot:

- Cap do: A2, B1, B2, C1. Khong tao category A1 cho video dai o MVP.
- Chu de: Daily English, Work & Business, Science & Technology, Space, News & Culture.
- Thoi luong: duoi 5 phut, 5-10 phut, tren 10 phut.
- Nguon: Kurzgesagt, VOA Learning English, NASA, CC BY, doi tac khac.
- Sort: De xuat, Moi nhat, Ngan nhat, Hoc tiep.

Quy tac gan level:

- Level khong chi dua vao ten kenh. Admin gan level sau khi xem toc do noi (WPM), do dai cau, mat do tu vung va do phuc tap cua transcript.
- Kurzgesagt mac dinh B2/C1; VOA Learning English thuong A2/B1; NASA thuong B2/C1. Tung lesson van co the duoc gan level khac neu noi dung phu hop.

### 25.5 UI man hoc `/listen/dictation/[lessonId]` da chot

Desktop wireframe:

```text
< Quay lai    [Nguon: Kurzgesagt]  The Most ...       [B2] [Toc do 1x]

---------------------------------------------------+----------------------
| YouTube player                                   |  Tien do 14 / 51     |
|                                                   |  o #14 Dang hoc      |
| [Nghe lai] [Lui 3s] [0.75x 1x 1.25x]             |  o #15 Chua hoc      |
|                                                   |  o #16 Chua hoc      |
---------------------------------------------------+----------------------
| #14  03:12 - 03:25       Muc che: [30%] [50%] [100%]                    |
| [The scientists ________ .........................................]     |
| [Hint] [Nghe lai]                                      [Kiem tra / Enter]|
| Feedback: dung / thieu / sai / du                                          |
| [Cau truoc]                                            [Cau tiep theo]     |
---------------------------------------------------+----------------------
```

Mobile:

- Player nam tren cung; sticky thanh action nho gom `Nghe lai`, toc do va chi so `14/51`.
- Danh sach segment mo trong bottom sheet qua nut `Danh sach doan`; khong chiem man hinh thuong truc.
- O nhap va nut kiem tra nam trong vung de cham bang ngon tay, khong bi keyboard che.

Luot hoc cua mot segment:

1. Nguoi hoc chon segment hoac vao `Hoc tiep`.
2. Player seek den start, phat va dung tai end. Khong hien transcript day du.
3. UI lay prompt tu server theo muc che dang chon.
4. Hoc vien go phan bi an (30/50) hoac ca doan (100), bam Enter/`Kiem tra`.
5. Server cham, luu progress neu da dang nhap va tra feedback theo token.
6. UI hien tu dung mau xanh, tu thieu mau vang, tu sai/du mau do; sau feedback hien dap an day du va nut `Nghe lai`.
7. Neu dung: mo nut `Cau tiep theo`; neu bat `Tu dong tiep`, chuyen sau 700-1000ms. Neu sai: cho phep nghe lai va lam lai khong gioi han.
8. Ket thuc video: hien tong ket so segment completed/mastered, segment can on, nut `On cau sai` va `Ve thu vien`.

Phim tat desktop:

- `Space`: play/pause segment.
- `R`: nghe lai segment.
- `Enter`: kiem tra; sau feedback la sang cau tiep theo.
- `ArrowLeft` / `ArrowRight`: cau truoc / cau sau khi focus khong nam trong input.
- `1`, `2`, `3`: chon muc che 30/50/100 neu khong dang go.

Quy tac muc che:

- 30%: an `ceil(30% * so-tu-hop-le)`, uu tien cum tu mang nghia va phan bo deu; khong an toan bo mot cau o lesson moi.
- 50%: an 50% tu, bao gom cum tu, contractions va tu noi quan trong.
- 100%: khong gui transcript hien thi; dung mot o textarea de go ca segment.
- Vi tri tu an phai deterministic theo `segmentId + maskPercent`; reload, mobile va desktop luon nhin cung mot prompt.
- `Hint`: goi y chu cai dau cua mot blank. Dung hint van co the completed, nhung khong du dieu kien mastered.

Cham dap an:

- Bo qua upper/lower case, khoang trang du, Unicode quote va dau cau khong anh huong nghia.
- Khong tu dong coi moi cach viet khac la dung. Dung `acceptedNormalizedAnswers` duoc admin duyet cho cach viet hop le (vi du contraction/expanded form neu muon chap nhan).
- 30/50 cham cac blank; 100 cham toan bo chuoi token.
- Ket qua gom `correctTokenCount`, `expectedTokenCount`, `scorePercent`, `feedbackTokens` va `expectedText` chi sau luc submit.
- `completed`: score 100%. `mastered`: score 100%, mask 100, `hintCount = 0`.

### 25.6 Firestore schema da chot

Them collection constants vao `web/src/lib/firestore/collections.ts`:

```ts
dictationLessons: "dictationLessons",
dictationRights: "dictationRights",
```

#### A. Lesson public

```text
dictationLessons/{lessonId}
```

```json
{
  "status": "PUBLISHED",
  "orderIndex": 100,
  "title": "The Most Insane Megaproject You Never Heard About",
  "slug": "most-insane-megaproject",
  "descriptionVi": "...",
  "sourceName": "Kurzgesagt - In a Nutshell",
  "sourceType": "PARTNER_PERMISSION",
  "sourceUrl": "https://www.youtube.com/watch?v=...",
  "youtubeVideoId": "...",
  "embedUrl": "https://www.youtube-nocookie.com/embed/...",
  "thumbnailUrl": "https://...",
  "durationSeconds": 786,
  "language": "en",
  "accent": "US",
  "level": "B2",
  "topics": ["SCIENCE_TECHNOLOGY"],
  "segmentCount": 51,
  "wordCount": 1548,
  "estimatedWpm": 142,
  "transcriptOrigin": "RIGHTS_HOLDER_FILE",
  "licenseStatus": "VERIFIED",
  "publicAttribution": "Video by Kurzgesagt - In a Nutshell. Used with permission.",
  "rightsId": "dictationRights/{lessonId}",
  "publishedAtMillis": 0,
  "createdAtMillis": 0,
  "updatedAtMillis": 0,
  "createdByUid": "...",
  "updatedByUid": "..."
}
```

Trang thu vien chi query `status = PUBLISHED`. Khong dat transcript day du trong document lesson: tranh tai document lon va tranh lo dap an khi chi load catalog.

`status`: `DRAFT | REVIEW | PUBLISHED | ARCHIVED`.

`sourceType`: `PARTNER_PERMISSION | CC_BY | PUBLIC_DOMAIN | NC_LICENSE | OTHER_LICENSE`.

#### B. Segment public co dap an chi server doc

```text
dictationLessons/{lessonId}/segments/{segmentId}
```

ID nen on dinh: `s001`, `s002`, ... . Schema:

```json
{
  "lessonId": "...",
  "index": 1,
  "startSeconds": 12.4,
  "endSeconds": 24.1,
  "leadInSeconds": 0.4,
  "tailSeconds": 0.3,
  "speaker": "Narrator",
  "expectedText": "...",
  "acceptedNormalizedAnswers": ["..."],
  "translationVi": null,
  "wordCount": 15,
  "status": "PUBLISHED",
  "createdAtMillis": 0,
  "updatedAtMillis": 0
}
```

`expectedText` phai chi duoc doc boi Admin SDK/service. Public API lesson khong duoc tra field nay truoc luc submit. Firestore client rules co the cho phep doc segment metadata neu can, nhung front-end hien tai dung server route; uu tien tra DTO da loc field (`id`, `index`, start/end, wordCount, speaker, status).

#### C. Bang chung quyen dung (private)

```text
dictationRights/{lessonId}
```

```json
{
  "lessonId": "...",
  "licenseType": "PARTNER_PERMISSION",
  "permissionScope": ["YOUTUBE_EMBED", "TRANSCRIPT_DISPLAY", "DICTATION_EXERCISES"],
  "evidenceUrl": "private-admin-only URL or asset reference",
  "evidenceNote": "Email confirmation on ...",
  "attributionRequired": true,
  "attributionText": "...",
  "verifiedByUid": "...",
  "verifiedAtMillis": 0,
  "expiresAtMillis": null,
  "reviewStatus": "VERIFIED"
}
```

Khong dung `mediaAssets` hien tai de luu email/contract quyen dung vi collection do dang public read. `dictationRights` mac dinh khong co Firestore client rule read/write; chi Admin SDK va admin API duoc truy cap.

#### D. Progress user

```text
users/{uid}/dictationLessonProgress/{lessonId}
users/{uid}/dictationLessonProgress/{lessonId}/segments/{segmentId}
```

Summary document:

```json
{
  "lessonId": "...",
  "lessonTitleSnapshot": "...",
  "sourceNameSnapshot": "...",
  "levelSnapshot": "B2",
  "segmentCountSnapshot": 51,
  "completedCount": 14,
  "masteredCount": 4,
  "lastSegmentIndex": 15,
  "lastMaskPercent": 50,
  "startedAtMillis": 0,
  "lastStudiedAtMillis": 0,
  "completedAtMillis": null,
  "updatedAtMillis": 0
}
```

Segment progress document:

```json
{
  "lessonId": "...",
  "segmentId": "s015",
  "segmentIndex": 15,
  "attemptCount": 3,
  "replayCount": 5,
  "hintCount": 1,
  "lastMaskPercent": 50,
  "highestPassedMaskPercent": 50,
  "lastScorePercent": 100,
  "lastAnswer": "...",
  "completedAtMillis": 0,
  "masteredAtMillis": null,
  "lastStudiedAtMillis": 0,
  "updatedAtMillis": 0
}
```

Chi luu `lastAnswer`, khong luu toan bo lich su go tung phim. Neu sau nay can analytics sau, them collection server-only `dictationAttemptEvents`, co TTL, khong can lam MVP.

Guest flow dung `localStorage` key `englishweb:dictation-progress:v1`. Luu toi da summary va progress cua vai lesson gan nhat; khi user dang nhap, khong tu dong merge ma co nut `Luu tien do tren thiet bi nay` de tranh ghi de ket qua server.

#### E. Firestore rules va indexes

Rules can them/sua:

```text
dictationLessons/{lessonId}
  read: chi neu status == PUBLISHED
  write: false

dictationLessons/{lessonId}/segments/{segmentId}
  read: chi neu lesson cha PUBLISHED
  write: false

dictationRights/{lessonId}
  read/write: false

users/{uid}/dictationLessonProgress/{lessonId}
users/{uid}/dictationLessonProgress/{lessonId}/segments/{segmentId}
  client write: false; server route dung Admin SDK ghi
```

Cap nhat generic user-subcollection rule de no khong vo tinh cho client tu ghi `dictationLessonProgress`, neu khong nguoi dung co the fake completed/mastered. APIs server-side la source of truth.

Index du kien:

```text
dictationLessons: status ASC, level ASC, orderIndex ASC
dictationLessons: status ASC, topics ARRAY_CONTAINS, orderIndex ASC
dictationLessons: status ASC, sourceName ASC, orderIndex ASC
users/{uid}/dictationLessonProgress: lastStudiedAtMillis DESC
```

Chi tao index sau khi query thuc te bao can; commit vao `firestore.indexes.json` khi da xac dinh query.

### 25.7 API contracts va server flow

#### A. Catalog

`GET /api/dictation/lessons?level=B2&topic=SCIENCE_TECHNOLOGY&source=Kurzgesagt&duration=MEDIUM&cursor=...`

- Public, chi tra lesson PUBLISHED.
- Response bao gom card DTO va progress summary neu user da dang nhap.
- Cursor pagination, default 24 card; khong scan toan bo collection o client.

#### B. Load lesson

`GET /api/dictation/lessons/{lessonId}`

- Kiem tra lesson PUBLISHED.
- Tra metadata, source attribution, player config, danh sach segment metadata va progress cua user.
- Khong tra `expectedText`, `acceptedNormalizedAnswers` hay transcript day du.
- Khach nhan progress local o client; user dang nhap nhan server progress.

#### C. Lay prompt

`GET /api/dictation/lessons/{lessonId}/segments/{segmentId}/prompt?maskPercent=30`

- Service load expected text o server, tokenize va chon blank deterministic.
- Response 30/50 la mang prompt token:

```json
{
  "segmentId": "s015",
  "maskPercent": 50,
  "prompt": [
    { "kind": "text", "value": "I" },
    { "kind": "space", "value": " " },
    { "kind": "blank", "blankId": "b01", "length": 9 }
  ]
}
```

- Response 100 chi co huong dan va `inputMode: FULL_TEXT`; khong co expected text.

#### D. Submit attempt

`POST /api/dictation/lessons/{lessonId}/segments/{segmentId}/attempt`

Request:

```json
{
  "maskPercent": 50,
  "blankAnswers": { "b01": "wondering" },
  "fullAnswer": null,
  "replayCount": 2,
  "hintCount": 0,
  "elapsedSeconds": 18
}
```

Flow server:

1. Validate lesson/segment PUBLISHED, mask 30/50/100, max input length va rate limit.
2. Load expected text server-side; tao lai blank mapping deterministic.
3. Normalize, cham, tinh feedback token-level va `scorePercent`.
4. Neu da dang nhap: transaction update segment progress + lesson summary; cap nhat study activity module `listening` sau khi completed segment.
5. Tra feedback. Chi tu thoi diem nay response moi co `expectedText` de hoc vien doi chieu.

Response:

```json
{
  "scorePercent": 100,
  "isCompleted": true,
  "isMastered": false,
  "feedbackTokens": [
    { "value": "wondering", "state": "CORRECT" }
  ],
  "expectedText": "...",
  "nextRecommendedMaskPercent": 100
}
```

Khach cung duoc cham nhu tren nhung `saved: false`; client cap nhat localStorage. Khong tin bat ky diem/correct flag nao tu client.

#### E. Progress va restart

- `GET /progress`: load summary + segment progress cua lesson da dang nhap.
- `POST /progress/merge-guest`: optional, can auth, chi merge khi user bam nut xac nhan.
- `POST /progress/reset`: can auth, reset mot lesson, co confirm UI. Khong xoa lesson/content.

#### F. Admin content flow

1. Admin tao DRAFT voi title, YouTube ID, source, level, topic va evidence quyen dung.
2. Service validate YouTube ID format, URL, duration, enum va rang buoc `licenseStatus`.
3. Admin paste/upload SRT/VTT; parser bo tag, parse timestamp, giu speaker neu co.
4. Parser merge/split caption thanh segment muc tieu 8-18 giay. Segment qua 25 giay bat buoc admin sua; segment duoi 3 giay duoc merge voi doan ke ben canh.
5. Admin xem preview player + segment list + prompt 30/50/100; sua text, start/end, speaker va accepted answers.
6. Admin danh dau rights `VERIFIED`; chi khi day du evidence va co it nhat mot segment moi duoc publish.
7. Publish chay transaction cap nhat segmentCount, wordCount, WPM, status PUBLISHED va ghi `contentAuditLogs`.
8. Archive giu progress cu nhung an lesson khoi catalog; lesson dang hoc hien message content da tam an.

### 25.8 Logic transcript, tokenization va grading

Parser SRT/VTT:

- Ho tro `HH:MM:SS,mmm` va `HH:MM:SS.mmm`.
- Loai HTML/VTT tags, chuan hoa whitespace/Unicode apostrophe; khong tu sua noi dung hoc thuat bang AI.
- Merge caption lien ke neu khoang cach < 0.8s va tong do dai <= 18s.
- Tao warning neu timestamp chong cheo, gap lon, khong co text, qua 25s, hoac transcript co ky tu khong phu hop.
- Admin luon la nguoi quyet dinh ban cuoi cung cua transcript.

Tokenizer:

- Tach `word`, `space`, `punctuation`; chap nhan apostrophe va hyphen trong tu (`don't`, `well-known`).
- Normalization dung cho cham: lowercase, trim, collapse space, doi curly apostrophe thanh apostrophe, bo punctuation ngoai tu.
- `expectedText` van giu dung dau cau/capitalization de hien feedback va hoc vien thay mau cau tu nhien.

Blank selection:

- Seed tu `lessonId:segmentId:maskPercent:contentVersion`.
- Chi an word tokens; khong tao blank o punctuation.
- Uu tien tu dai, content word va contraction theo heuristic; sau do phan bo deu de tranh 3 blank lien tiep o muc 30%.
- Neu segment co < 3 word: MVP khong cho 30/50, chi dung 100 hoac merge segment.

Accepted answers:

- Mac dinh mot dap an chinh la `expectedText`.
- Admin co the them alternative da duyet. Vi du `I am` va `I'm` chi duoc coi la tuong duong neu admin them vao list.
- Khong dung LLM de tu quyet dinh dap an dung o runtime.

### 25.9 Security, privacy va content governance

- Kiem tra `status PUBLISHED` o moi public endpoint; khong dua DRAFT/REVIEW vao HTML, response hay metadata OpenGraph.
- `dictationRights` private; khong luu email nguon/contract vao public lesson doc.
- Admin routes bat buoc `requireRole("ADMIN")`, validate schema, log action publish/archive/import vao `contentAuditLogs`.
- Bound input: max 1,000 ky tu/attempt, max 10,000 ky tu/transcript segment, gioi han so segment/lesson de tranh abuse.
- Dat rate limit cho submit attempt theo uid neu da dang nhap, neu khach thi theo IP/session; feedback van uu tien de hoc khong bi block vo ly.
- Dung attribution o card va page lesson theo `publicAttribution`; link luon mo video goc tab moi.
- Khi license het han/bi rut: admin archive ngay, khong xoa rights log. Lesson khong con public, progress user van giu de thong ke noi bo.

### 25.10 Thay doi code, rules va data migration

1. Sua `src/app/(app)/listen/page.tsx` de them nav link Nghe-chep sau Part 4. Link nay khong di qua `LevelDashboardClient`.
2. Them `types/dictation.ts`, collection constants, validation schemas va `dictation.ts` service rieng.
3. Them parser SRT/VTT va grading pure functions co unit test.
4. Them public routes/SSR pages, sau do client player/component.
5. Them admin route/page import va preview. Admin media upload hien tai chi AUDIO/IMAGE; khong sua no de upload video YouTube. Neu can luu file transcript, them media type `TRANSCRIPT` private hoac chi luu parsed segments.
6. Cap nhat `firestore.rules` va `firestore.indexes.json`; deploy rules truoc hoac cung luc voi API.
7. Seed thu cong mot collection Kurzgesagt da duoc cap quyen (khong viet script crawl YouTube).
8. Cap nhat Hub/Continue Learning sau khi Dictation co progress on dinh; khong dua vao scope MVP neu lam cham launch.

### 25.11 Test plan va acceptance criteria

Unit tests:

- Parse SRT/VTT: timestamp hop le, cue chong cheo, tag, speaker, merge/split.
- Tokenization va normalization: punctuation, quote, contraction, hyphen.
- Blank selection deterministic cho 30/50/100.
- Grading: dung, thieu, sai, du, alternative answer, hint/mastery rule.
- Service transaction: completedCount/masteredCount khong bi dem tang hai lan khi submit lai cung segment.

API tests:

- Catalog khong tra DRAFT va khong tra `expectedText`.
- Prompt 30/50 khong lam lo blank words; prompt 100 khong co transcript.
- Attempt chi server-side grade; client `correct` field neu gui kem phai bi bo qua.
- Guest nhan feedback nhung khong tao Firestore user progress.
- Admin moi co the import/publish/archive.

Component/E2E tests:

- Mock YouTube Player API: select segment -> seek start -> pause end.
- Enter cham va chuyen segment; phim R nghe lai; keyboard khong intercept khi focus input.
- Refresh khi da login hoi phuc `lastSegmentIndex` va progress.
- Mobile 360px: player, o input, feedback va segment bottom sheet su dung duoc.
- Video unavailable co fallback link, khong blank page.

Acceptance MVP:

- Sidebar co Nghe-chep ngay sau Part 4; Part 1-4 chay nhu cu.
- Thu vien filter/load duoc lesson PUBLISHED va the hien dung progress.
- Mot lesson YouTube co the hoc tung segment, chep va cham 30/50/100.
- Transcript dap an khong co trong initial lesson payload; chi hien sau submit/hint theo luong duoc phep.
- Logged-in user resume dung segment; guest co progress local trong cung browser.
- Admin co the tao, preview, publish va archive lesson ma khong can code/deploy.
- Khong co content nao duoc publish neu thieu `licenseStatus = VERIFIED`, attribution hoac transcript segment hop le.

### 25.12 Thu tu trien khai khuyen nghi

1. Them type/schema Firestore, service read-only va rules/indexes.
2. Tao `/listen/dictation` bang seed mock de chot UI library truoc.
3. Tao man lesson voi fake player adapter + prompt/attempt API; viet grading tests truoc UI phuc tap.
4. Tich hop YouTube IFrame API, segment playback va keyboard/mobile UX.
5. Lam admin import SRT/VTT, preview, license gate, audit log.
6. Nhap 1 lesson Kurzgesagt, QA end-to-end, sau do them 10 lesson dau tien.
7. Do usage, loi transcript/player va ty le hoan thanh truoc khi them shadowing, vocabulary va recommendations.

Lenh verify sau moi milestone:

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
