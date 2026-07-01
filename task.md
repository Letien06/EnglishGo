# Task Board - EnglishWebApp Dautoeic-style Free Clone

> Trang thai: `[ ]` chua lam, `[~]` dang lam, `[x]` xong.
> Nguyen tac: moi task phai ra duoc san pham nhin thay tren browser, gom FE + BE + database/seed neu can + kiem thu co ban.
> Muc tieu: bam sat luong hoc, bo cuc chuc nang va trai nghiem hoc TOEIC cua Dautoeic nhat co the trong stack hien tai.
> Gioi han phap ly/ky thuat: khong copy logo, asset, noi dung, cau hoi, text marketing hoac file source cua Dautoeic. Tat ca noi dung trong app la noi dung tu tao/seed rieng.
> Chinh sach san pham: tat ca tinh nang hoc deu FREE. Khong co goi ban, khong Premium, khong paywall, khong checkout, khong upsell.

## Phase 0 - Nen tang va dinh huong

- [x] **P0.1 Fix local run**: app doc `.env`, Firebase config render duoc, browser vao `/` redirect `/login` thay vi 403.
- [x] **P0.2 Research Dautoeic**: lap route map, module map, gap analysis trong `docs/dautoeic-research.md`.
- [x] **P0.3 UI shell Dautoeic-style**
  - FE: header, sidebar/mobile bottom nav, card, button, badge, tabs, empty/error/loading states.
  - BE: `LayoutControllerAdvice` nap user/current route/nav state.
  - Scope: tao cam giac app hoc tap dashboard, khong copy asset/logo/mau y chang.
  - Files du kien: `templates/fragments/*`, `static/css/app.css`, cac template hien co.

## Phase 1 - Learner Hub va dashboard

- [x] **P1.1 Route `/hub` thay dashboard cu**
  - FE: hub co greeting, daily goal, streak, quick actions: Listen, Read, Vocabulary, Mock Test, Wrong, Starred.
  - BE: `HubController`, `HubService`, DTO tong hop tien do.
  - DB: bo sung bang hoac cot neu can cho daily goal/streak.
  - Done: login xong vao `/hub`, co so lieu seed/thuc tu attempts/vocab.

- [x] **P1.2 Account settings**
  - FE: `/account` cho avatar, display name, target score, level.
  - BE: endpoint update profile co validation.
  - DB: dung `users` hien co, bo sung audit fields neu can.
  - Done: user sua muc tieu diem va thay doi hien tren hub.

- [ ] **P1.3 Leaderboard learner**
  - FE: `/leaderboard` co top users, filter weekly/all-time.
  - BE: query rank tu attempts/streak, fallback seed.
  - DB: xem lai `leaderboard_entries`, them period neu can.
  - Done: co bang xep hang that, khong chi static.

## Phase 2 - Skill hubs: Listen / Read / Grammar

- [ ] **P2.1 Listen hub `/listen`**
  - FE: trang hub Listening co TOEIC Part 1-4, progress, CTA luyen nhanh.
  - BE: service dem so cau/bai theo part, lay next recommended item.
  - DB: dung `questions.part`, can chuan hoa type/audio group.
  - Done: click Part 1-4 mo practice co audio neu seed co.

- [ ] **P2.2 Read hub `/read`**
  - FE: trang hub Reading co Part 5-7 va tab Grammar/Bilingual neu phu hop.
  - BE: query bai doc/cau hoi theo part, weak areas.
  - DB: bo sung metadata topic/tag cho questions neu can.
  - Done: click Part 5-7 mo practice dung nhom passage/question.

- [ ] **P2.3 Grammar module `/grammar`**
  - FE: danh sach topic/subtopic, lesson card, nut practice.
  - BE: `GrammarController`, `GrammarService`; co the reuse `lessons` truoc, sau do tach `grammar_topics`.
  - DB: migration cho grammar topic/subtopic/exercises neu can.
  - Done: hoc 1 topic, lam 1 set bai tap, luu ket qua.

## Phase 3 - Practice engine Dautoeic-style

- [ ] **P3.1 Unified practice route**
  - FE: thay `/tests/{id}/practice` bang shell co route moi: `/practice/session/{sessionId}` hoac route module.
  - BE: tao `PracticeSession` abstraction: source = test, part, grammar, wrong, starred, random.
  - DB: migration cho sessions neu can; giu `user_attempts` cho submitted result.
  - Done: practice bat dau tu hub va route cu van redirect/hoat dong.

- [ ] **P3.2 Practice UX nang cao**
  - FE: timer, question navigator, answered/flagged states, keyboard 1-4, previous/next, pause, submit confirm.
  - BE: autosave payload gom current index, answers, flagged IDs, elapsed time.
  - DB: dung `draft_answers` hoac tach `practice_drafts`.
  - Done: reload trang khong mat bai, UI hien da luu.

- [ ] **P3.3 Review result theo part**
  - FE: review co overview, per-part accuracy, wrong list, explanation/transcript.
  - BE: DTO review gom grouped questions, skill stats.
  - DB: dung `user_answers`, bo sung selected answer snapshot neu can.
  - Done: nop bai xong thay diem, cau sai, giai thich.

## Phase 4 - Wrong / Starred / Random loops

- [ ] **P4.1 Starred questions**
  - FE: nut star trong practice/review, route `/starred-practice`.
  - BE: CRUD starred question per user.
  - DB: `user_starred_questions(user_id, question_id, created_at)`.
  - Done: star cau trong review, vao `/starred-practice` luyen lai.

- [ ] **P4.2 Wrong answers queue**
  - FE: `/wrong-practice` hien queue cau sai, filter by part.
  - BE: query cau sai tu `user_answers`, tao session luyen lai.
  - DB: co the them `wrong_answer_reviews` de theo doi da on/chua on.
  - Done: nop sai cau nao thi cau do xuat hien trong queue.

- [ ] **P4.3 Random practice**
  - FE: `/random-practice` chon skill, part, so cau, timed mode.
  - BE: query random questions co seed de reproducible.
  - DB: index theo part/type/topic.
  - Done: tao bai random va cham nhu practice thuong.

## Phase 5 - Vocabulary Dautoeic-style

- [ ] **P5.1 Rename/route vocabulary**
  - FE: route moi `/vocabulary`, giu `/vocab` redirect.
  - BE: controller route moi, DTO progress.
  - DB: dung `vocab_sets`, `vocab_words`, `user_vocab_progress`.
  - Done: trang vocab home co sets, due today, mastered/difficult counts.

- [ ] **P5.2 Difficult/mastered pages**
  - FE: `/vocabulary/difficult`, `/vocabulary/mastered`.
  - BE: query theo `user_vocab_progress.status`.
  - DB: chuan hoa enum status neu can.
  - Done: danh dau kho/thuoc va thay doi queue.

- [ ] **P5.3 Vocabulary test/shared**
  - FE: practice tu vung dang multiple choice/fill blank, trang shared set.
  - BE: endpoint tao vocab test va cham.
  - DB: bang `vocab_tests` neu can.
  - Done: user lam test tu vung va luu ket qua.

## Phase 6 - Mock test roadmap

- [ ] **P6.1 Mock test home `/mock-test`**
  - FE: danh sach full tests, mini tests, roadmap Part 1-7.
  - BE: filter tests by type/difficulty/part.
  - DB: chuan hoa `tests.type` = MOCK, MINI, PART_PRACTICE.
  - Done: user thay mock test va vao lam.

- [ ] **P6.2 Mock test settings**
  - FE: choose mode: full timed, practice, review.
  - BE: tao session voi rule time/audio.
  - DB: them `test_settings` neu can.
  - Done: full test co timer tong va result theo part.

## Phase 7 - Free access cleanup

- [ ] **P7.1 Remove paywall thinking**
  - FE: khong co pricing, locked feature, upgrade CTA, premium badge.
  - BE: khong check entitlement cho learner features.
  - DB: `subscriptions`/`transactions` chi de legacy/demo, khong dung de khoa tinh nang.
  - Done: moi learner dang nhap deu vao duoc tat ca module hoc.

- [ ] **P7.2 Route cleanup for old billing**
  - FE: `/billing` hien thong bao "all features are free" hoac redirect ve `/hub`.
  - BE: vo hieu hoa checkout demo neu khong can.
  - Done: khong con luong thanh toan trong san pham hoc.

## Phase 8 - Admin CMS theo module

- [ ] **P8.1 Admin dashboard `/admin`**
  - FE: metrics users, attempts, content counts, issue reports.
  - BE: `AdminDashboardService`, role ADMIN.
  - DB: query aggregate.
  - Done: admin login thay dashboard rieng, khong co revenue/sales widget.

- [ ] **P8.2 Admin content modules**
  - FE: tach menu `/admin/listening`, `/admin/reading`, `/admin/vocabulary`, `/admin/mock-test`.
  - BE: CRUD service rieng cho content, validation.
  - DB: migration cho tags/topics/media neu can.
  - Done: admin tao/sua cau hoi va learner thay trong hub.

- [ ] **P8.3 Import media/CSV**
  - FE: upload CSV/Excel/audio/image, preview before import.
  - BE: parser/import service, report loi theo dong.
  - DB: media table neu can.
  - Done: import 1 bo cau hoi Part 5 tu CSV.

## Phase 9 - AI generator va content review

- [ ] **P9.1 AI question generator `/admin/generate`**
  - FE: form chon TOEIC part, skill, difficulty, topic, so cau; preview JSON/result.
  - BE: `ContentGenerationService` goi AI provider de tao TOEIC-style questions, khong copy de that.
  - DB: `content_generation_jobs`, `generated_questions`.
  - Guardrail: output phai validate schema, co 4 options neu multiple choice, co correct answer, explanation, transcript/passage neu can.
  - Done: admin tao draft 5 cau Part 5/Part 7, nhung chua publish thang vao learner bank.

- [ ] **P9.2 Generated content review `/admin/content-review`**
  - FE: queue draft AI, editor sua cau hoi/options/explanation, approve/reject.
  - BE: review service publish draft vao `tests/questions/question_groups/answer_options`.
  - DB: `content_audit_logs`, reviewed_by/reviewed_at/status.
  - Done: chi cau duoc approve moi xuat hien trong `/read`, `/listen`, `/mock-test`.

- [ ] **P9.3 AI prompt library**
  - FE: admin chon template: Part 1 image prompt, Part 2 question-response, Part 5 grammar, Part 6 passage, Part 7 reading.
  - BE: prompt templates versioned, JSON schema per TOEIC part.
  - DB: co the them `ai_prompt_templates`.
  - Done: prompt co version, co the rollback/cai tien ma khong pha generated history.

## Phase 10 - Community submit va import workflow

- [ ] **P10.1 Community/teacher submit `/contribute`**
  - FE: form gui cau hoi/passages/options/explanation/source note.
  - BE: save vao `content_submissions` status `PENDING_REVIEW`.
  - DB: `content_submissions`.
  - Guardrail: bat buoc checkbox "toi co quyen su dung noi dung nay".
  - Done: contributor gui cau hoi, admin thay trong review queue.

- [ ] **P10.2 CSV/Excel import to review queue**
  - FE: upload CSV/Excel, map columns, preview validation errors.
  - BE: import parser tao `content_submissions` hang loat, khong publish truc tiep.
  - DB: `content_submissions`, import batch id neu can.
  - Done: import 1 file Part 5 mau, approve moi vao bank chinh.

- [ ] **P10.3 Source/license tracking**
  - FE: hien source type/note tren admin review.
  - BE: enforce source metadata cho AI/community/import.
  - DB: source_type, source_note, license_note, attribution.
  - Done: moi cau hoi publish co metadata nguon noi dung.

## Phase 11 - PWA polish va chat luong

- [ ] **P11.1 PWA manifest/version**
  - FE: manifest, app icons, theme color, version banner.
  - BE: `/version.json`, static cache headers.
  - Done: cai duoc PWA va update khong ket cache.

- [ ] **P11.2 Test coverage**
  - FE: smoke test cac route chinh bang Playwright neu them toolchain.
  - BE: service tests cho grading, SRS, practice session, content generation validation, import parser.
  - Done: `mvn test` pass va co test cho logic moi.
