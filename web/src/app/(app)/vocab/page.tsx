import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import VocabMyTab from "./VocabMyTab";

const tabs = [
  { key: "learn", label: "Học (demo)", icon: "▦" },
  { key: "progress", label: "Tiến độ", icon: "⊙" },
  { key: "my", label: "Từ vựng của tôi", icon: "☆" },
  { key: "algorithm", label: "Thuật toán học từ", icon: "⚙" },
  { key: "community", label: "Cộng đồng", icon: "⦿" },
] as const;

export default async function VocabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const active = typeof params.tab === "string" ? params.tab : "learn";
  const user = await getCurrentUser();
  const folderId = typeof params.folderId === "string" ? Number(params.folderId) : undefined;
  const folderSearch = typeof params.q === "string" ? params.q : undefined;

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
            const selected = active === tab.key || (!active && tab.key === "learn");
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

        {active === "my" ? (
          <VocabMyTab
            uid={user?.uid ?? ""}
            folderId={Number.isFinite(folderId) ? folderId : undefined}
            folderSearch={folderSearch}
          />
        ) : (
          <section className="flex min-h-52 items-center justify-center rounded-xl border border-amber-100 bg-white p-8 text-center shadow-sm">
            <div>
              <div className="mx-auto mb-5 text-3xl text-amber-200">▦</div>
              <h2 className="text-xl font-extrabold text-ink">
                Học từ vựng đang ở chế độ demo
              </h2>
              <p className="mt-3 text-sm text-muted">
                Mục Bộ từ của tôi đã mở lại để tạo bộ, thêm từ, import file và vào game luyện tập.
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
