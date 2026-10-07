import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { getCurrentUserForRead } from "@/lib/auth/session";
import { leaderboard, normalizePeriod } from "@/lib/services/community";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LeaderboardPage({ searchParams }: Props) {
  const user = await getCurrentUserForRead();
  const sp = await searchParams;
  const period = normalizePeriod(sp.period as string | undefined);
  const entries = await leaderboard(period);

  return (
    <>
      <AppTopbar pageTitle="Bảng xếp hạng cộng đồng" pageSubtitle="Người học dẫn đầu theo điểm luyện tập" userName={user?.displayName} userEmail={user?.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-4">
        <nav className="flex gap-2" aria-label="Khoảng thời gian xếp hạng">
          <Link href="/community/leaderboard?period=all-time" aria-current={period === "ALL_TIME" ? "page" : undefined} className={`px-4 py-2 rounded-xl text-sm font-extrabold transition-colors ${period === "ALL_TIME" ? "bg-primary text-gold-ink shadow-sm" : "bg-surface border border-line text-ink2 hover:bg-surface-soft"}`}>
            Tất cả
          </Link>
          <Link href="/community/leaderboard?period=weekly" aria-current={period === "WEEKLY" ? "page" : undefined} className={`px-4 py-2 rounded-xl text-sm font-extrabold transition-colors ${period === "WEEKLY" ? "bg-primary text-gold-ink shadow-sm" : "bg-surface border border-line text-ink2 hover:bg-surface-soft"}`}>
            Tuần này
          </Link>
        </nav>
        <section className="rounded-xl bg-surface border border-line overflow-hidden">
          {entries.map((entry) => (
            <div key={entry.uid} className="flex items-center justify-between p-4 border-b border-line last:border-0">
              <div>
                <strong className="text-ink">{entry.rankPosition}. {entry.displayName || entry.email || "Người học"}</strong>
                <p className="text-xs text-muted">{entry.email}</p>
              </div>
              <strong className="text-primary">{entry.score.toFixed(2)}</strong>
            </div>
          ))}
          {entries.length === 0 && <div className="p-8 text-center text-muted">Chưa có dữ liệu xếp hạng.</div>}
        </section>
      </main>
    </>
  );
}
