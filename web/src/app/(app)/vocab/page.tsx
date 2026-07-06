import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";
import * as dautoeicVocab from "@/lib/services/dautoeic-vocab";
import VocabMyTab from "./VocabMyTab";

const tabs = [
  { key: "learn", label: "Học", icon: "▦" },
  { key: "progress", label: "Tiến độ", icon: "⊙" },
  { key: "my", label: "Từ vựng của tôi", icon: "☆" },
  { key: "algorithm", label: "Thuật toán học từ", icon: "⚙" },
  { key: "community", label: "Cộng đồng", icon: "⦿" },
] as const;

type VocabTabKey = (typeof tabs)[number]["key"];

export default async function VocabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const active = normalizeTab(typeof params.tab === "string" ? params.tab : "learn");
  const user = await getCurrentUser();
  const folderId = typeof params.folderId === "string" ? Number(params.folderId) : undefined;
  const communityFolderId = typeof params.communityFolderId === "string" ? Number(params.communityFolderId) : undefined;
  const folderSearch = typeof params.q === "string" ? params.q : undefined;
  const groupId = typeof params.group === "string" ? params.group : undefined;

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#f1f5fb] px-5 py-10">
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="flex min-h-48 items-center justify-between rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-slate-100 px-9 py-8 shadow-sm">
          <div>
            <span className="inline-flex rounded-full bg-white px-4 py-1 text-xs font-extrabold text-primary shadow-sm">
              ✦ Spaced Repetition System
            </span>
            <h1 className="mt-6 text-4xl font-extrabold text-ink">
              Chinh phục <span className="text-primary">Từ vựng TOEIC</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Học theo phương pháp lặp lại ngắt quãng, đưa đúng từ vào đúng thời điểm bạn sắp quên.
              Nhớ lâu hơn và học gọn hơn.
            </p>
          </div>
          <div className="hidden h-32 w-32 items-center justify-center rounded-3xl bg-primary text-5xl font-extrabold text-gold-ink shadow-xl lg:flex">
            ▦
          </div>
        </section>

        <nav className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-amber-200 bg-amber-50 p-1" aria-label="Vocabulary tabs">
          {tabs.map((tab) => {
            const selected = active === tab.key;
            return (
              <Link
                key={tab.key}
                href={`/vocab?tab=${tab.key}`}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-extrabold transition-colors ${
                  selected
                    ? "bg-primary text-gold-ink"
                    : "text-muted hover:bg-white hover:text-ink"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {active === "learn" ? (
          <LearnTab uid={user?.uid ?? ""} groupId={groupId} />
        ) : active === "progress" ? (
          <ProgressTab uid={user?.uid ?? ""} />
        ) : active === "my" ? (
          <VocabMyTab
            uid={user?.uid ?? ""}
            folderId={Number.isFinite(folderId) ? folderId : undefined}
            folderSearch={folderSearch}
          />
        ) : active === "community" ? (
          <CommunityTab
            query={folderSearch}
            communityFolderId={Number.isFinite(communityFolderId) ? communityFolderId : undefined}
          />
        ) : (
          <AlgorithmTab />
        )}
      </div>
    </main>
  );
}

function normalizeTab(value: string): VocabTabKey {
  return tabs.some((tab) => tab.key === value) ? (value as VocabTabKey) : "learn";
}

async function LearnTab({ uid, groupId }: { uid: string; groupId?: string }) {
  let catalog: Awaited<ReturnType<typeof dautoeicVocab.getVocabularyCatalogView>> | null = null;
  try {
    catalog = await dautoeicVocab.getVocabularyCatalogView(uid);
  } catch {
    catalog = null;
  }

  if (catalog?.cards.length) {
    const selectedGroupId =
      groupId && catalog.groups.some((group) => group.id === groupId)
        ? groupId
        : catalog.groups[0]?.id;
    const cards = selectedGroupId
      ? catalog.cards.filter((card) => card.setId === selectedGroupId)
      : catalog.cards;

    return (
      <section className="space-y-5">
        <nav className="flex max-w-full gap-2 overflow-x-auto" aria-label="Vocabulary groups">
          {catalog.groups.map((group) => {
            const selected = group.id === selectedGroupId;
            return (
              <Link
                key={group.id}
                href={`/vocab?tab=learn&group=${encodeURIComponent(group.id)}`}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-extrabold transition-colors ${
                  selected
                    ? "border-primary bg-primary text-gold-ink"
                    : "border-sky-200 bg-white text-primary hover:bg-sky-50"
                }`}
              >
                {group.name} ({group.count})
              </Link>
            );
          })}
        </nav>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const percent = card.wordCount > 0
              ? Math.round((card.masteredWords / card.wordCount) * 100)
              : 0;
            const pro = card.accessLevel === "pro";
            return (
              <article key={card.id} className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <span className="rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-extrabold text-indigo-700">
                      {card.setName}
                    </span>
                    <h2 className="mt-4 line-clamp-2 text-lg font-extrabold text-ink">
                      {card.title}
                    </h2>
                  </div>
                  {pro ? (
                    <span className="rounded-full bg-orange-500 px-2 py-1 text-[10px] font-extrabold text-white">
                      PRO
                    </span>
                  ) : null}
                </header>
                <p className="mt-3 text-sm text-muted">{card.wordCount} từ vựng</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-muted">
                  <span>{card.masteredWords}/{card.wordCount} từ đã thuộc</span>
                  {card.dueWords > 0 ? <span className="text-red-600">{card.dueWords} cần ôn</span> : null}
                </div>
                <Link
                  href={`/vocab/dautoeic/${encodeURIComponent(card.id)}`}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-emerald-300 px-4 py-2 text-xs font-extrabold text-emerald-700 hover:bg-emerald-50"
                >
                  Vào học
                </Link>
              </article>
            );
          })}
        </section>
      </section>
    );
  }

  let sets: Awaited<ReturnType<typeof vocab.findSetCards>>;
  try {
    sets = await vocab.findSetCards();
  } catch {
    return (
      <EmptyPanel
        icon="▦"
        title="Chưa tải được bộ từ gợi ý"
        description="Dữ liệu bộ từ chưa sẵn sàng trong môi trường hiện tại. Bạn vẫn có thể vào Từ vựng của tôi để quản lý bộ riêng."
      />
    );
  }

  if (sets.length === 0) {
    return (
      <EmptyPanel
        icon="▦"
        title="Chưa có bộ từ gợi ý"
        description="Bạn vẫn có thể vào mục Từ vựng của tôi để tạo bộ riêng, import file và luyện tập với 6 chế độ game."
      />
    );
  }

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sets.map((set) => (
        <article key={set.id} className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-xl font-extrabold text-primary">
              {set.icon || "▦"}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-primary">{set.topic}</p>
              <h2 className="mt-1 line-clamp-2 text-lg font-extrabold text-ink">{set.title}</h2>
              <p className="mt-2 text-sm text-muted">
                {set.wordCount} từ{set.level ? ` · ${set.level}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={`/vocab/${set.id}`}
              className="rounded-full border border-amber-200 px-4 py-2 text-xs font-extrabold text-ink hover:bg-amber-50"
            >
              Xem chi tiết
            </Link>
            <Link
              href={`/vocab/${set.id}/flashcards?mode=menu`}
              className="rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-gold-ink hover:opacity-90"
            >
              Chọn mode học
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}

async function ProgressTab({ uid }: { uid: string }) {
  if (!uid) {
    return (
      <EmptyPanel
        icon="⊙"
        title="Đăng nhập để xem tiến độ"
        description="Tiến độ học, lịch ôn và số từ đã thuộc được lưu theo tài khoản của bạn."
        actionHref="/login?redirect=/vocab%3Ftab%3Dprogress"
        actionLabel="Đăng nhập"
      />
    );
  }

  let total = 0;
  let learned = 0;
  let mastered = 0;
  let due = 0;
  let studiedToday = 0;
  let streak = 0;
  let progressSets: Awaited<ReturnType<typeof vocab.findProgressSetCards>> = [];

  try {
    [
      total,
      learned,
      mastered,
      due,
      studiedToday,
      streak,
      progressSets,
    ] = await Promise.all([
      vocab.totalWords(uid),
      vocab.learnedWords(uid),
      vocab.masteredWords(uid),
      vocab.dueWords(uid),
      vocab.studiedWordsToday(uid),
      vocab.streakDays(uid),
      vocab.findProgressSetCards(uid),
    ]);
  } catch {
    return (
      <EmptyPanel
        icon="⊙"
        title="Chưa tải được tiến độ"
        description="Dữ liệu tiến độ chưa sẵn sàng trong môi trường hiện tại. Hãy thử lại sau hoặc vào Bộ từ của tôi để học tiếp."
        actionHref="/vocab?tab=my"
        actionLabel="Bộ từ của tôi"
      />
    );
  }

  const dailyGoal = vocab.dailyNewWordGoal();
  const dailyPercent = dailyGoal > 0 ? Math.min(100, Math.round((studiedToday / dailyGoal) * 100)) : 0;

  return (
    <section className="space-y-5">
      <article className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-ink">Mục tiêu hôm nay</h2>
            <p className="mt-1 text-sm text-muted">
              {due} từ cần ôn · chuỗi học {streak} ngày
            </p>
          </div>
          <Link
            href="/vocab?tab=my"
            className="rounded-full border border-amber-200 px-4 py-2 text-xs font-extrabold text-ink hover:bg-amber-50"
          >
            Quản lý bộ từ
          </Link>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-sm font-extrabold text-blue-700">Ôn tập</p>
            <p className="mt-2 text-3xl font-extrabold text-ink">{due} <span className="text-sm text-muted">từ</span></p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm font-extrabold text-emerald-700">Từ mới</p>
            <p className="mt-2 text-3xl font-extrabold text-ink">{studiedToday}<span className="text-sm text-muted">/{dailyGoal} từ</span></p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${dailyPercent}%` }} />
            </div>
            <p className="mt-2 text-xs font-bold text-emerald-700">{dailyPercent}% hoàn thành</p>
          </div>
        </div>
      </article>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="▦" label="Tổng thể" value={total} />
        <StatCard icon="□" label="Đã học" value={learned} />
        <StatCard icon="✓" label="Thành thạo" value={mastered} />
        <StatCard icon="⊙" label="Cần ôn" value={due} />
      </section>

      {progressSets.length === 0 ? (
        <EmptyPanel
          icon="⊙"
          title="Chưa có tiến độ học"
          description="Học một bộ từ hoặc mở game trong Bộ từ của tôi để hệ thống lưu tiến độ và lịch ôn."
        />
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {progressSets.map((set) => {
            const masteredPercent = set.totalWords > 0 ? Math.round((set.masteredWords / set.totalWords) * 100) : 0;
            const learningWords = Math.max(0, set.learnedWords - set.masteredWords);
            return (
              <article key={set.id} className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
                <header className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-xl font-extrabold text-primary">
                    {set.icon || "☆"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-primary">{set.topic}</p>
                    <h3 className="mt-1 line-clamp-2 text-base font-extrabold text-ink">{set.title}</h3>
                  </div>
                  <b className={set.dueWords > 0 ? "text-sm text-red-600" : "text-sm text-emerald-600"}>
                    {set.dueWords > 0 ? `${set.dueWords} cần ôn` : `${masteredPercent}%`}
                  </b>
                </header>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${masteredPercent}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted">
                  <span>{set.masteredWords}/{set.totalWords} đã thuộc</span>
                  <span>{set.learnedWords} đã học</span>
                  <span>{learningWords} đang học</span>
                </div>
                <footer className="mt-5 flex flex-wrap gap-2">
                  <Link href={`/vocab/${set.id}`} className="rounded-full border border-amber-200 px-4 py-2 text-xs font-extrabold text-ink hover:bg-amber-50">
                    Xem chi tiết
                  </Link>
                  <Link
                    href={set.dueWords > 0 ? `/vocab/${set.id}/flashcards?mode=menu&mastery=due&order=random&amount=20` : `/vocab/${set.id}/flashcards?mode=menu`}
                    className="rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-gold-ink hover:opacity-90"
                  >
                    {set.dueWords > 0 ? "Chọn mode ôn" : "Học tiếp"}
                  </Link>
                </footer>
              </article>
            );
          })}
        </section>
      )}
    </section>
  );
}

async function CommunityTab({
  query,
  communityFolderId,
}: {
  query?: string;
  communityFolderId?: number;
}) {
  const selectedId = Number.isFinite(communityFolderId) ? communityFolderId : undefined;
  let folders: Awaited<ReturnType<typeof vocab.findCommunityFolderCards>> = [];
  let selectedFolder: Awaited<ReturnType<typeof vocab.getCommunityFolderCard>> = null;
  let communitySets: Awaited<ReturnType<typeof vocab.findCommunitySetCards>> = [];
  let loadError = false;

  try {
    [folders, selectedFolder, communitySets] = await Promise.all([
      vocab.findCommunityFolderCards(query),
      selectedId ? vocab.getCommunityFolderCard(selectedId) : Promise.resolve(null),
      selectedId ? vocab.findCommunitySetCards(selectedId) : Promise.resolve([]),
    ]);
  } catch {
    loadError = true;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
        <form action="/vocab" className="flex min-w-0 flex-1 flex-wrap gap-2">
          <input type="hidden" name="tab" value="community" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Tìm kiếm thư mục cộng đồng..."
            className="min-w-60 flex-1 rounded-full border border-amber-200 px-4 py-2 text-sm outline-none focus:border-primary"
          />
          <button className="rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-gold-ink">
            Tìm kiếm
          </button>
        </form>
        <Link href="/vocab?tab=my" className="rounded-full border border-amber-200 px-4 py-2 text-xs font-extrabold text-ink hover:bg-amber-50">
          Bộ từ của tôi
        </Link>
      </div>

      {loadError ? (
        <EmptyPanel
          icon="⦿"
          title="Chưa tải được cộng đồng"
          description="Dữ liệu cộng đồng chưa sẵn sàng trong môi trường hiện tại. Tab này sẽ tự hiển thị lại khi kết nối dữ liệu hoạt động."
        />
      ) : selectedFolder ? (
        <section className="space-y-4">
          <article className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
            <Link href="/vocab?tab=community" className="text-sm font-extrabold text-primary">
              ← Quay lại
            </Link>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-ink">{selectedFolder.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  Người chia sẻ: {selectedFolder.ownerName || "Cộng đồng"} · {selectedFolder.setCount} bộ từ
                </p>
              </div>
              <Link
                href="/vocab?tab=my"
                className="rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-gold-ink"
              >
                Vào bộ từ của tôi
              </Link>
            </div>
          </article>

          {communitySets.length === 0 ? (
            <EmptyPanel
              icon="□"
              title="Folder chưa có bộ từ"
              description="Hãy quay lại danh sách cộng đồng để chọn folder khác."
            />
          ) : (
            <section className="grid gap-4 md:grid-cols-2">
              {communitySets.map((set) => (
                <article key={set.id} className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-extrabold text-primary">{set.topic}</p>
                  <h3 className="mt-1 text-lg font-extrabold text-ink">{set.title}</h3>
                  <p className="mt-2 text-sm text-muted">{set.wordCount} từ</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link href={`/vocab/${set.id}`} className="rounded-full border border-amber-200 px-4 py-2 text-xs font-extrabold text-ink hover:bg-amber-50">
                      Xem
                    </Link>
                    <Link href={`/vocab/${set.id}/flashcards?mode=menu`} className="rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-gold-ink">
                      Học thử
                    </Link>
                  </div>
                </article>
              ))}
            </section>
          )}
        </section>
      ) : folders.length === 0 ? (
        <EmptyPanel
          icon="⦿"
          title="Chưa có folder cộng đồng"
          description="Chia sẻ một folder cá nhân trong Bộ từ của tôi để mọi người có thể xem và học theo."
        />
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {folders.map((folder) => (
            <Link
              key={folder.id}
              href={`/vocab?tab=community&communityFolderId=${folder.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm hover:border-primary"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-xl font-extrabold text-primary">
                □
              </span>
              <strong className="mt-4 block text-lg text-ink">{folder.name}</strong>
              <small className="mt-2 block text-sm text-muted">
                {folder.setCount} bộ từ · Người chia sẻ: <b>{folder.ownerName || "Cộng đồng"}</b>
              </small>
            </Link>
          ))}
        </section>
      )}
    </section>
  );
}

function AlgorithmTab() {
  return (
    <section className="rounded-2xl border border-amber-100 bg-white p-6 shadow-sm">
      <div className="max-w-2xl">
        <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Spaced Repetition</p>
        <h2 className="mt-2 text-2xl font-extrabold text-ink">Thuật toán học từ</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          ENGLISHGO dùng lịch ôn tập lặp lại ngắt quãng kiểu SM-2: từ khó quay lại sớm hơn,
          từ đã thuộc được giãn lịch ôn để bạn học ít hơn nhưng nhớ lâu hơn.
        </p>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Again", "Ôn lại sớm khi quên hoặc trả lời sai."],
          ["Hard", "Giữ khoảng cách ngắn cho từ còn yếu."],
          ["Good", "Tăng lịch ôn theo mức nhớ ổn định."],
          ["Easy", "Giãn lịch xa hơn cho từ đã rất chắc."],
        ].map(([label, description]) => (
          <article key={label} className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <strong className="text-lg text-ink">{label}</strong>
            <p className="mt-2 text-sm text-muted">{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
      <span className="text-lg text-primary">{icon}</span>
      <p className="mt-2 text-xs font-extrabold text-muted">{label}</p>
      <strong className="mt-1 block text-2xl text-ink">{value}</strong>
    </article>
  );
}

function EmptyPanel({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section className="flex min-h-52 items-center justify-center rounded-xl border border-amber-100 bg-white p-8 text-center shadow-sm">
      <div>
        <div className="mx-auto mb-5 text-3xl text-amber-200">{icon}</div>
        <h2 className="text-xl font-extrabold text-ink">{title}</h2>
        <p className="mt-3 max-w-xl text-sm text-muted">{description}</p>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="mt-5 inline-flex rounded-full bg-primary px-5 py-2 text-xs font-extrabold text-gold-ink"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
