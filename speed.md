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
