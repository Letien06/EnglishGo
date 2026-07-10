# Speed Audit

Ngay do: 2026-07-07 20:06 ICT

Pham vi: audit hieu nang app Next.js tren local production server (`next start`, `http://127.0.0.1:3000`), viewport desktop 1365x900. Khong sua source code trong lan audit nay; file nay chi la bao cao.

## Cach do

- Build dung production output hien co va chay `next start`.
- Dung Playwright do anonymous va authenticated session.
- Authenticated session duoc tao bang Firebase test UID `perf-audit-local` de co cookie `session` that, khong thao tac Google popup.
- Moi route cho `page.goto(..., waitUntil: "domcontentloaded")`, sau do doi `networkidle` toi da 6s va them 600ms de bat request nen.
- Cot `Wall` vi vay la tong thoi gian "route + request nen on page"; FCP/DOMContentLoaded moi la tin hieu page hien noi dung ban dau.
- Vercel Analytics/Speed Insights bi abort tren local (`/_vercel/...`), bo qua trong ket luan.

## Ket qua chua dang nhap

| Route/flow | Final URL | TTFB | DOMContentLoaded | FCP | Wall | API calls | Nhan xet |
|---|---:|---:|---:|---:|---:|---:|---|
| `/` landing | `/` | 110ms | 133ms | n/a | 1.48s | 0 | Tot. Trang chu da static, khong con auth/Firebase API thua. |
| `/login` | `/login` | 15ms | 27ms | 348ms | 1.48s | 0 | Tot. Load them Firebase client chunk cho login UI. |
| `/listen` anonymous | `/login?from=%2Flisten` | 5ms | 23ms | 336ms | 1.47s | 0 | Middleware redirect nhanh. |
| `/read` anonymous | `/login?from=%2Fread` | 5ms | 21ms | 344ms | 1.48s | 0 | Middleware redirect nhanh. |
| `/vocab` anonymous | `/login?from=%2Fvocab` | 3ms | 16ms | 352ms | 1.48s | 0 | Middleware redirect nhanh. |
| `/practice` anonymous | `/login?from=%2Fpractice` | 4ms | 19ms | 348ms | 1.48s | 0 | Middleware redirect nhanh. |
| `/api/health` | `/api/health` | 4ms | 16ms | 36ms | 1.14s | 1 | Endpoint OK, response request ~18ms. |
| Click CTA landing -> `/practice` | `/login?from=%2Fpractice` | n/a | n/a | n/a | 574ms | 0 | Nut protected CTA redirect nhanh. |

Ket luan anonymous: hien tai khong con diem ngheo lon cho nguoi chua dang nhap. Route protected redirect bang middleware rat nhanh va khong goi API auth. Diem can de y nho: login page van tai Firebase client SDK, chap nhan duoc vi chi dung cho login.

## Ket qua da dang nhap

| Route | Wall | DOMContentLoaded | FCP | API calls | Request cham nhat |
|---|---:|---:|---:|---:|---|
| `/hub` | 4.87s | 3.63s | 152ms | 1 | `/hub` 3.63s, `/api/study/streak` 2.83s |
| `/listen` | 6.65s | 34ms | 112ms | 5 | `/api/study/streak` 2.89s, `/api/listening/levels?part=1` 2.32s |
| `/listen?part=part2` | 6.64s | 29ms | 100ms | 5 | `/api/study/streak` 2.88s, `/api/listening/levels?part=2` 2.44s |
| `/read` | 5.57s | 26ms | 112ms | 4 | `/api/study/streak` 2.99s, `/api/reading/levels?part=5` 2.44s |
| `/read?part=part7` | 5.84s | 29ms | 120ms | 4 | `/api/study/streak` 2.89s, `/api/reading/levels?part=7` 2.54s |
| `/vocab?tab=learn` | 4.46s | 600ms | 88ms | 2 | `/api/dautoeic/vocab/catalog` 2.57s, `/api/study/streak` 2.48s |
| `/vocab?tab=my` | 4.99s | 589ms | 80ms | 3 | `/api/vocab/my-sets` 3.27s, `/api/vocab/my-folders` 3.27s, `/api/study/streak` 3.18s |
| `/vocab?tab=progress` | 3.90s | 578ms | 88ms | 2 | `/api/study/streak` 2.68s, `/api/vocab/progress` 2.14s |
| `/practice` | 3.98s | 2.67s | 64ms | 1 | `/api/study/streak` 2.77s, `/practice` 2.67s |
| `/community` | 2.47s | 1.07s | 92ms | 1 | `/api/study/streak` 1.23s, `/community` 1.06s |
| `/leaderboard` | 7.85s | 1.23s | 84ms | 1 | `/api/study/streak` 1.37s, `/leaderboard` 1.23s |
| `/account` | 2.59s | 974ms | 92ms | 1 | `/api/study/streak` 1.36s, `/account` 973ms |

Luu y: cac page `listen/read` hien noi dung khung rat nhanh (DOMContentLoaded < 35ms), nhung dashboard level va streak tiep tuc load API nen `Wall` cao. Nguoi dung van cam thay cham vi skeleton/overlay va request nen tiep tuc chay tren moi route.

## Ket qua click flow da dang nhap

| Flow | Ket qua | Wall moi click | API/request dang chu y |
|---|---|---:|---|
| App nav `/hub` -> `/listen` -> `/read` -> `/vocab` -> `/practice` | Thanh cong | 545-566ms/click | Nhieu RSC prefetch bi abort; `/api/study/streak` lap 3 lan, 1.36-1.63s. |
| `/listen` doi part 2 -> bam practice dau tien | Thanh cong | 558ms, 545ms | Levels API van chay 0.81-0.96s cho part 1-4, streak 1.07s. |
| Landing CTA `/practice` anonymous | Thanh cong | 574ms | Redirect login nhanh, khong API. |
| Vocab tab switch | Co dau hieu race/overdelay trong phep do | ~550ms/click | `/api/vocab/progress` co lan 500 vi thieu Firestore index; can fix truoc khi danh gia lai. |

## Hotspot uu tien

### 1. `/api/study/streak` dang la request cham lap lai tren moi man hinh logged-in

Bang chung:

- Xuat hien tren hau het route trong AppShell do `StudyStreakBadge`.
- Cham 1.07s den 3.18s trong cac lan do.
- `StudyStreakBadge` fetch `/api/study/streak` moi pathname va moi window focus.
- API goi `getCurrentUser()`, `getStudyStreak(uid)`, sau do `refreshStudyStreakSummary(uid, streak)`.
- `getStudyStreak` doc toi da 500 doc `users/{uid}/studyActivity`.
- `refreshStudyStreakSummary` ghi lai summary vao `users/{uid}` ngay trong GET.

Rui ro/anh huong:

- Moi lan chuyen trang logged-in deu ton 1 request Firestore doc nhieu + co the write user doc
- Write trong GET lam tang latency va chi phi, dong thoi gay cam giac app "con dang tai" du da render noi dung.

Huong toi uu:

- Doi `/api/study/streak` doc summary da denormalize tren `users/{uid}` truoc, chi recompute khi summary thieu/cu qua TTL.
- Khong write Firestore trong GET thuong. Chi refresh khi record activity hoac job nen.
- Dedupe/caching client trong `StudyStreakBadge`, vi badge khong can fresh moi route. Co the TTL 30-60s/session.
- Neu page server da co streak (hub/leaderboard), pass initial value vao shell/badge de tranh fetch dau tien.

### 2. Listen/Read level dashboard fan-out nhieu API va prefetch som

Bang chung:

- `/listen` goi 5 API: streak + active level + 3 sibling prefetch.
- `/read` goi 4 API: streak + active level + 2 sibling prefetch.
- Level API cham 0.8s den 2.5s moi request.
- `LevelDashboardClient` prefetch sibling parts sau 450ms.
- Route `/api/listening/levels` va `/api/reading/levels` moi request deu goi `getCurrentUser()`, `dautoeic.list...DifficultyLevels(part)`, roi `applyProgress`.

Rui ro/anh huong:

- Part switching co ve nhanh neu skeleton da render, nhung server/API bi fan-out va lam `networkidle` lau.
- Tren mobile/ket noi yeu, 3-4 request Firestore/Supabase song song co the lam dashboard va nut "Luyen ngay" cham hien.

Huong toi uu:

- Gom endpoint: `/api/listening/levels?parts=1,2,3,4` va `/api/reading/levels?parts=5,6,7` de verify user 1 lan va batch progress.
- Tach base difficulty levels (public/cache 10 phut) khoi user progress; base co the static/edge cache, progress query nho hon.
- Prefetch sibling parts bang `requestIdleCallback`/hover thay vi luon chay sau 450ms.
- Luu progress summary theo `{part, level}` trong user doc/subcollection nho, tranh scan progress rows moi lan.

### 3. Vocab "My" bi duplicate Firestore work

Bang chung:

- `/vocab?tab=my`: `/api/vocab/my-sets` 3.27s va `/api/vocab/my-folders` 3.27s chay song song.
- Hai endpoint deu `requireUser()`.
- `findMySetCards` va `findMyFolderCards` deu goi `liveOwnerSets(uid)`; `findMySetCards` con goi `liveOwnerFolders(uid)`.
- `wordCountBySetId` tao count query theo tung set/chunk.

Rui ro/anh huong:

- Tab My goi trung Firestore queries trong 2 endpoint rieng.
- Neu user co nhieu set/folder, thoi gian va chi phi tang theo so set.

Huong toi uu:

- Tao endpoint tong hop `/api/vocab/my` tra ve `{sets, folders}` trong 1 lan auth + 1 lan doc ownerSets/folders.
- Denormalize `wordCount` tren `vocabSets` khi tao/import/copy words.
- Denormalize `setCount` tren `vocabFolders` hoac tinh tu ownerSets da co, khong query lap.

### 4. `/api/vocab/progress` co loi 500 do Firestore index

Bang chung:

- Flow vocab tab co lan `/api/vocab/progress` status 500, duration 791ms.
- Server log: `FAILED_PRECONDITION: The query requires an index`.
- Query lien quan `userVocabProgress` voi `status` + `nextReviewAtMillis`.
- `firestore.indexes.json` da co index tuong tu nhung `queryScope` dang la `COLLECTION`; log Firebase yeu cau collection group path `collectionGroups/userVocabProgress`, nen co kha nang index chua deploy hoac scope sai can chuyen/deploy `COLLECTION_GROUP`.

Rui ro/anh huong:

- Tab progress co the fail that tren production neu index chua ton tai.
- Loi nay la uu tien truoc toi uu vi anh huong chuc nang.

Huong toi uu:

- Deploy/fix composite index cho `userVocabProgress`: `status ASC, nextReviewAtMillis ASC` dung scope collection group neu query can.
- Sau khi fix, do lai `/vocab?tab=progress`.
- Xem lai `Promise.all` trong `/api/vocab/progress`: hien gom nhieu count/query rieng (`totalWords`, `learnedWords`, `masteredWords`, `dueWords`, `studiedWordsToday`, `streakDays`, `findProgressSetCards`, `findPracticeSetOptions`). Co the gom thanh 1 lan doc progress docs + aggregate in memory cho user nho, hoac denormalize summary.

### 5. `/hub` server render cham

Bang chung:

- `/hub` document request 3.63s, DOMContentLoaded 3.63s.
- `getHub` doc profile, load attempts, get streak, count mastered words.
- `getStudyStreak` scan `studyActivity`; `countMasteredWords` doc subcollection `vocabProgress`.

Rui ro/anh huong:

- Dashboard la route sau login mac dinh nen day la diem nguoi dung logged-in gap dau tien.
- Neu Google login xong redirect `/hub`, user co the thay qua trinh vao app cham.

Huong toi uu:

- Dung summary fields tren `users/{uid}` cho streak, completedTests, masteredWords, todayActivityCount.
- Cap nhat summary khi submit/review/record activity thay vi tinh lai khi render dashboard.
- Parallelize doc profile voi attempts/streak/masteredWords.
- Kiem tra collection name `vocabProgress` vs `userVocabProgress`; neu sai collection thi vua ton query vua khong co so dung.

### 6. `/practice` list cham do server render dynamic

Bang chung:

- `/practice` document request 2.67s.
- Page `force-dynamic`, goi `getCurrentUser()` va `findTests(...)`.
- `findTests` co the goi `hasTestIndex()`, `writeTestIndex(await dautoeic.listTests(null))` neu index thieu, roi `queryTestIndex`.

Huong toi uu:

- Dam bao `dauToeicTestIndex` duoc warm/deploy san, khong build index trong request nguoi dung.
- Cache danh sach test public trong `unstable_cache`/static revalidate, chi merge user-specific progress rieng.
- Prefetch/warmup practice content hien co trong modal la dung huong, nhung nen tranh kich hoat nhieu warmup neu user thay doi part lien tuc.

### 7. Bundle/chunk co the toi uu sau khi giai quyet API

Chunk static lon nhat sau build:

- `3rxl-jt3pdxgx.js`: 227 KB
- `1_zmgipypuk59.js`: 137 KB
- `3zyis1e7gk-gl.js`: 113 KB
- `0cz1d0mv5g_q7.js`: 113 KB
- CSS chunk: 75 KB

Nhan xet:

- Tren local, script chunks chi 20-70ms/request, khong phai bottleneck chinh so voi Firestore/Supabase 1-3s.
- Sau khi toi uu API, moi nen soi bundle chi tiet bang analyzer. Ung vien: Firebase client chi nen o login; PDF/XLSX/admin/media khong nen vao common route; Vercel analytics co the chi load production.

## Thu tu nen lam

1. Sua/deploy Firestore index cho `/api/vocab/progress` de het 500.
2. Toi uu `/api/study/streak`: doc summary, bo write trong GET, TTL/dedupe client.
3. Gom/batch listen/read levels endpoint va tri hoan sibling prefetch.
4. Gom `/api/vocab/my-sets` + `/api/vocab/my-folders` thanh 1 endpoint, denormalize counts.
5. Denormalize dashboard summary cho `/hub`.
6. Warm/index practice tests ngoai request nguoi dung.
7. Chay lai Playwright audit tren production deployment that (Vercel/domain) de xac nhan latency internet/CDN.

## Lenh da chay

- `npm run build`
- `next start --hostname 127.0.0.1 --port 3000`
- Playwright custom audit script cho anonymous/authenticated routes va click flows.

## Trang thai working tree lien quan

- Bao cao nay them file `speed.md`.
- Khong sua source code trong audit nay.
- Luu y truoc audit da co thay doi chua commit o `web/src/components/ThemeToggle.tsx` tu truoc; audit khong dung vao file do.

## Implementation pass 2026-07-07

Da code theo thu tu uu tien cua bao cao:

1. `/api/vocab/progress` khong con phu thuoc query composite `status + nextReviewAtMillis`; route nay dung `vocab.progressOverview()` de doc progress mot lan, aggregate in-memory, va tranh loi 500 do index chua deploy.
2. `/api/study/streak` uu tien doc summary tren `users/{uid}` va khong write Firestore trong GET. `StudyStreakBadge` co cache/in-flight client 60 giay, focus moi force refresh.
3. `/api/listening/levels` va `/api/reading/levels` ho tro `?parts=...`; `LevelDashboardClient` goi mot request batch cho tat ca parts thay vi active part + sibling prefetch rieng le.
4. Them `/api/vocab/my` de tra ve `{sets, folders}` trong mot request; `VocabMyTab` dung endpoint nay thay cho hai request `my-sets` va `my-folders`.
5. `/hub` doc profile, attempts, streak summary, mastered count song song; mastered words chuyen sang dung dung subcollection `userVocabProgress`.
6. `practice.findTests()` duoc cache 10 phut bang `unstable_cache` de giam Firestore/Supabase work cho danh sach de.

Verification sau implementation:

- Targeted ESLint cho cac file da sua: pass.
- `npm run build`: pass, `/` van static, route moi `/api/vocab/my` duoc build.

---

# Full flow audit 2026-07-10

Ngay audit: 2026-07-10 (Asia/Ho_Chi_Minh).

Pham vi lan nay rong hon audit 2026-07-07: kiem ke 26 page routes, 63 API routes va khoang 390 diem tuong tac (`button`, `Link`, `onClick`, `fetch`). Kiem thu runtime tren production build local bang tai khoan Firebase rieng `perf-audit-local`; cac nut co side effect (xoa du lieu, nop bai, gui binh luan, doi mat khau, upload) duoc doi chieu frontend -> route -> service thay vi bam that len du lieu dung chung.

## Cach doc so lieu

- `Shell`: thoi gian header/khung trang xuat hien. Trang client nhu `/listen`, `/read`, `/vocab` co shell nhanh nhung data card van tai sau.
- `Ready`: noi dung chinh/card da hien. Server Component co streaming nen `page.goto`/DOMContentLoaded khong phai luc nao cung la tin hieu on dinh; so lieu API phia duoi dang tin cay hon de tim bottleneck.
- So lieu local co Firestore/Supabase qua Internet, vi vay dao dong theo mang. Ket luan dua tren ca timing va so luot I/O trong code.
- Local hien thieu `DAUTOEIC_ANON_KEY`, nen `/api/dautoeic/vocab/catalog` tra 500. UI co fallback sang `/api/vocab/sets`; production can co bien nay de dung catalog that.

## Ma tran toan bo trang

| Trang/luong | Ket qua runtime | Danh gia toc do | Logic nut/link |
|---|---|---|---|
| `/` | ~0.37s lan dau | Nhanh, static | CTA dang ky/login dung; theme/menu dung. Phat hien `/lessons` truoc day 404, da them trang thu vien bai hoc. |
| `/login` | ~0.35s FCP theo audit truoc | Chap nhan duoc | Chuyen Dang nhap/Dang ky, Google login, email form co validate; Firebase SDK chi nam o trang login. |
| `/lessons` | Truoc: 404 | Loi logic da sua | Da them hub tinh cho Ngu phap/Doc, Nghe, Tu vung, De thi. |
| `/hub` | 3.1-4.0s voi user moi | Cham | Link Hoc tiep/4 ky nang/BXH dung. Cham do auth + profile + streak + daily summary + vocab due + practice summary. |
| `/continue` | 1.6-1.8s | Trung binh | Recommendation, draft de thi, vocab history dung; empty state dung. |
| `/listen` va Part 1-4 | Shell <0.1s; batch API 2.79s truoc, 1.89s sau | Da cai thien, van phu thuoc Firestore/nguon cau hoi | Link chuyen Part dung; 5 card level, Reset va Luyen ngay dung. Batch progress giam 4 query Firestore xuong 1. |
| `/listen/practice` | ~3.6s den session dau | Cham | Chuyen mode, auto, audio, dap an, yeu thich, ghi chu, them vocab, truoc/sau dung theo code. Nut tra loi truoc day cho streak va BXH tuan tu; da cho chay song song. |
| `/read` va Part 5-7 | Shell <0.12s; batch API 2.63s truoc, 2.29s sau | Da cai thien nhe | Link chuyen Part va 5 level dung; batch progress giam 3 query xuong 1. |
| `/read/practice` | ~3.6s den session dau | Cham | Mode, auto, dap an, ghi chu, yeu thich, them vocab, dieu huong dung; cung huong loi toi uu activity/BXH. |
| `/vocab?tab=learn` | 1.5s khi catalog san; local fallback co the 3-5s | Cham khi external catalog loi | Catalog va local sets truoc day tai noi tiep; da cho tai song song. Link chi tiet va game dung. |
| `/vocab?tab=progress` | API ~1.83-2.01s | Trung binh/cham | So lieu tong, mastered, due va link hoc dung; query progress da aggregate in-memory, khong con loi composite index cu. |
| `/vocab?tab=my` | Ready ~3.7s cold; API ~1.62-1.74s | Cham cold, nhanh khi session cache | Tao set/folder, sua/xoa, them thu cong/file/paste/AI co route dung. Mot so modal cu chua hien API error day du; xem muc logic can tiep tuc. |
| `/vocab?tab=algorithm` | Server/static content | Nhanh | Chi noi dung giai thich, khong mutation. |
| `/vocab?tab=community` | ~3.4s cold trong lan do | Cham | Folder/set/copy dung; phu thuoc nhieu Firestore counts. |
| `/vocab/[setId]` | ~3.5s cold voi set 3 tu; filter 62ms | Server data cham, thao tac client nhanh | Tim kiem/filter/audio dung. Them xong truoc day `window.location.reload()` toan trang; da doi thanh fetch lai rieng danh sach tu. |
| `/vocab/[setId]/flashcards` | ~2.27s den menu voi set nho | Trung binh | 6 game, filter/order/count, sound, history va SRS hien dung; mo Flashcard ~0.58s. Draft/history APIs co retry/catch. |
| `/vocab/dautoeic/[testId]` | Khong co credential catalog local de do day du | Phu thuoc external | Chon part -> sync -> session dung; can production smoke test co `DAUTOEIC_ANON_KEY`. |
| `/practice` | ~0.55s khi test index warm; cold 2.4s | Nhanh sau warm | Modal Thi thu/Luyen tap mo ~0.30s; Full/Part, chon tat ca/reset, 15/30/60/120, goi y, draft/resume dung. Warmup debounce 350ms. |
| `/practice/history` | ~2.2s server; empty state nho | Trung binh | Pagination/review/retry link dung. Cong cu do Ready theo do dai text bi timeout gia; khong phai 11.7s that. |
| `/practice/session/[testId]` | Phu thuoc warmup/content | Can production test theo de | Autosave local + server draft, danh dau, clear, previous/next, submit/exit confirm dung. Khong bam submit trong audit de tranh tao attempt. |
| `/practice/review/[attemptId]` | Can attempt that | Chua co mau test | Route kiem tra owner; retry/back dung theo source. |
| `/leaderboard` | 1.45-1.99s | Trung binh | Scope/period filter dung; query top 100 co limit. |
| `/community` | 1.0-1.7s | Trung binh | Comment form co xu ly response; link leaderboard/contribute dung. |
| `/community/leaderboard` | ~1.2s | Trung binh | Weekly/all-time link dung. |
| `/community/contribute` | ~0.58s server | Nhanh | Required title/content/rights; chi reset khi server success. |
| `/account` | 0.72-1.42s | Trung binh | Profile/avatar validate 5MB, resize client; password/profile co hien error. Luu avatar base64 vao user doc co the lam user doc lon. |
| `/ai/writing` | ~0.88s server truoc submit | Nhanh khi mo; submit phu thuoc AI | Validate prompt/response; chi reset khi API success. |
| `/admin` va 5 trang con | Student truoc day gap Server Error 403 | Loi logic da sua | Page guard moi redirect student ve `/hub`; API admin van giu 401/403. Admin runtime can tai khoan ADMIN de smoke test mutation. |

## Ma tran nhom nut va logic

| Nhom nut | Ket qua | Ghi chu hieu nang/logic |
|---|---|---|
| Header/sidebar/mobile nav | Dung | Link noi bo duoc Next navigation; overdelay chi hien sau 180ms, toi da 9s. |
| Theme toggle/menu mobile | Dung, client-only | Khong goi network. |
| Logout | Dung theo code | DELETE session roi ve landing; khong bam trong audit de giu phien test. |
| Listen/Read Part + Level | Dung | Data progress da batch 1 query/skill. Reset van reload toan trang va can hien loi ro neu API fail. |
| Tra loi Listen/Read | Logic score dung | Progress write la bat buoc; activity va leaderboard da song song. Streak duoc cap nhat ngay trong transaction, bo scan history sau moi dap an. |
| Practice modal | Dung | Warmup co debounce + AbortController, khong fan-out khi user doi lua chon nhanh. |
| Practice session | Dung qua static audit | Local draft tranh mat bai; server draft/submit co catch va confirmation. |
| Vocab search/filter | Dung, 62ms voi set nho | `useMemo`, khong network. |
| Vocab audio | Dung | Uu tien audio URL, fallback Web Speech. |
| Vocab them thu cong/file/paste | Dung | Parser pipe/csv/xlsx/pdf; normalize concurrency 8; sau save chi refresh danh sach. |
| Vocab AI | Dung | Preview moi tra tu dien; Save dung lai phonetic/audio da co, batch ID + Firestore write. Khong tra tu dien lai. |
| Vocab mark `Thuoc` | Can chinh logic | UI set `mastered=true` ngay sau quality=5, nhung SM-2 backend chi MASTERED sau >=3 repetitions. Reload co the dua switch ve false. Can quyet dinh day la `da nho lan nay` hay `force mastered`. |
| Flashcard 6 game | Dung qua menu + static audit | Mo game nhanh; review/history/draft co API rieng. File component lon (~2,200 dong), nen tach mode de giam maintainability/bundle sau. |
| My vocab create/rename/delete | Route dung | Create/rename modal cu dong ngay ca khi response 4xx/5xx vi khong check `response.ok`; can them error state. Delete co confirm nhung cung khong check response. |
| Account forms | Dung | Password input bi reset ngay sau submit, ke ca API fail; nen reset sau success. |
| Comment/contribution/AI writing | Dung | Co response/error state; AI latency la external. |
| Admin upload/generate/review | Role guard dung | Mutation chua bam tren du lieu that; can staging ADMIN test rieng. |

## API timing doc truc tiep (authenticated, local production)

| Endpoint/page | Baseline lan do | Sau thay doi | Danh gia |
|---|---:|---:|---|
| `/api/health` | 6-55ms | 55ms | Tot |
| `/api/study/streak` | 1.26-3.58s | 3.99s voi test user chua co summary | Van cham o first-read; client cache 60s. Sau activity, summary moi duoc ghi atomically. |
| `/api/listening/levels?parts=1,2,3,4` | 2.794s | 1.894s | Giam ~32%, 4 progress query -> 1. |
| `/api/reading/levels?parts=5,6,7` | 2.627s | 2.289s | Giam ~13%, 3 progress query -> 1. |
| `/api/vocab/sets` | 1.62-1.98s | khong doi service | Cham do published sets + count theo set. |
| `/api/vocab/my` | 1.62-1.74s | khong doi service | Da gom sets/folders, con word count aggregate. |
| `/api/vocab/progress` | 1.83-2.01s | khong doi service | Chap nhan duoc nhung con nhieu reads/counts. |
| `/hub` | 3.13-3.38s | chua giam cold user | Hotspot server page lon nhat. |
| `/practice` | ~0.55s warm | ~0.55s | Tot sau cache 10 phut. |
| `/leaderboard` | 1.45-1.99s | khong doi | Trung binh. |
| `/account` | 0.72-1.42s | khong doi | Trung binh. |

## Toi uu da code trong lan audit nay

1. Them `applyProgressBatch`: mot query progress cho tat ca Part Nghe/Doc, thay vi mot query moi Part.
2. `recordProgress`: activity va leaderboard chay song song sau khi progress core da luu.
3. `recordStudyActivity`: streak/today count/modules duoc tinh va ghi ngay trong cung transaction. Bo `getStudyStreak()` scan toi 500 activity docs sau moi cau tra loi.
4. Vocab Learn tai external catalog va local fallback song song.
5. Chi tiet bo tu khong reload toan page sau them thu/file/AI; chi fetch lai `/api/vocab/sets/[setId]`.
6. Admin page guard redirect user khong co role thay vi nem ApiError lam UI server error.
7. Them route `/lessons` de tat ca link landing/footer khong con 404.

## Viec nen lam tiep theo

P0/P1:

1. Sua semantics nut `Thuoc` o chi tiet vocab (SM-2 vs force mastered).
2. Them error handling cho create/rename/delete trong `VocabMyTab`; khong dong modal khi API fail.
3. Dong bo modal AI cu trong `VocabMyTab` voi modal AI moi o trang chi tiet (Topic / Words / Image + thinking stages).
4. Cau hinh `DAUTOEIC_ANON_KEY` trong moi truong local/staging va chay lai catalog + `/vocab/dautoeic/[testId]`.

P2:

5. Denormalize `wordCount` vao `vocabSets` de bo count query theo tung set o Learn/My/Community/Progress.
6. Hub: luu practice summary/due vocab summary tren user doc va cap nhat khi mutation; muc tieu cold render <1.5s.
7. Study streak first-read: provision default daily summary cho user moi de tranh profile read + activity fallback.
8. Reset level: thay full reload bang cache invalidation/refetch va hien API error.
9. Tach `FlashcardGame.tsx` theo 6 game modes, dynamic import mode duoc chon.
10. Chay production smoke test tren domain that voi tai khoan STUDENT va ADMIN; local khong mo phong CDN/cold start Vercel.

## Verification 2026-07-10

- Browser runtime: landing, authenticated navigation, Listen/Read levels, practice modal, vocab My modal, vocab detail search/filter, flashcard menu/game, student admin redirect.
- `npm run lint`: pass.
- `npm test -- --run`: 9 files, 24 tests pass.
- `npm run build`: pass.
- `git diff --check`: bat buoc chay lai truoc commit.

## Ket qua trien khai "Viec nen lam tiep theo" 2026-07-10

| # | Trang thai | Ket qua / logic da kiem tra |
|---:|---|---|
| 1 | Done | Nut `Thuoc` gui `{ mastered: true }` va service force `MASTERED`; cac nut review trong game van dung SM-2 `{ quality }`. Hai semantics khong con bi tron. |
| 2 | Done | Create/rename/delete set/folder deu kiem tra HTTP response, hien loi trong modal va chi dong modal khi API thanh cong. Nut xoa co busy state chong bam lap. |
| 3 | Done | Modal AI trong My tab co 3 che do Chu de / Tu tieng Anh / Hinh anh, validate anh 5 MB va cac stage `AI dang suy nghi -> phan tich -> tra cuu tu dien -> hoan tat`. |
| 4 | Partial theo moi truong | Production `DAUTOEIC_ANON_KEY` dang hoat dong: catalog 200 ~1001ms; detail test `cf23d9a6-f125-4985-a91f-18be7ebce587` 200 ~891ms, 2 parts. Local khong co secret; service da tra catalog rong/fallback local thay vi 500. Khong commit secret vao Git. |
| 5 | Done | `vocabSets.wordCount` duoc cap nhat khi tao/luu/copy/sync. Learn/My/Community/Progress doc truc tiep field nay. Data cu duoc lazy backfill theo batch toi 30 set/query va co script `npm run backfill:vocab-word-count -- --write`. |
| 6 | Done | Hub doc practice/vocab/today summary tren `users/{uid}`. Practice submit va vocab review cap nhat aggregate; hub chi fallback reconcile voi user cu/thoi diem due vua den. Hot path khong con count mastered + due + scan attempt moi lan. |
| 7 | Done | User moi duoc provision streak, today XP/module counts, practice va vocab summary = 0; first-read khong scan activity collection. |
| 8 | Done | Reset Listen/Read refetch levels tai cho, co busy/error state; bo `window.location.reload()`. |
| 9 | Done | Flashcard, Quiz, Matching, Typing va Listening tach thanh dynamic chunks; Mixed chi nap mode con dang chay. `FlashcardGame.tsx` giam 488 dong. |
| 10 | Partial do phien dang nhap | Production public smoke: landing 200 (~3493ms cold), `/vocab` va `/admin` redirect dung ve login khi anonymous, health 200 (~392ms). Khong co san dong thoi phien STUDENT va ADMIN trong browser kiem thu nen khong danh dau pass gia cho mutation admin. Sau deploy can recheck `/lessons` (production cu dang 404). |

### Toi uu rieng nut Luu sau khi AI tao tu

- Van giu buoc tra tu dien trong `previewAiWords`; khong loai bo du lieu phien am/audio.
- Khi bam `Luu`, candidate AI khong bi tra lai tu dien lan thu hai. Save chi normalize, cap ID theo batch, ghi words theo batch va cap nhat `wordCount` mot lan.
- Manual/import van co pronunciation enrichment neu input chua co, nen logic cu khong bi mat.

### Verification sau trien khai

- `npm run lint`: pass, 0 error/warning.
- `npm test`: 9 files, 24 tests pass.
- `npm run build`: pass, TypeScript pass, 45 static pages generated; `/lessons` co trong route manifest.
- `npm run test:e2e`: 3/3 pass (health envelope, anonymous protected-route redirect, login mobile viewport).
- DauToeic production catalog/detail: pass nhu bang tren.
- Backfill local chua chay vi workspace khong co `FIREBASE_SERVICE_ACCOUNT_JSON`; lazy backfill dam bao production khong hien word count = 0 trong lan chuyen doi.
