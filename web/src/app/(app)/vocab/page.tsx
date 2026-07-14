import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";
import VocabLearnTabClient from "./VocabLearnTabClient";
import VocabMyTab from "./VocabMyTab";
import VocabProgressTabClient from "./VocabProgressTabClient";

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
    <main className="min-h-[calc(100dvh-4rem)] bg-bg px-5 py-10">
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
                data-overdelay={`Dang mo ${tab.label}...`}
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
          <VocabLearnTabClient groupId={groupId} />
        ) : active === "progress" ? (
          <VocabProgressTabClient />
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
