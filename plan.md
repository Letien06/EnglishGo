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

