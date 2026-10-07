import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { getCurrentUserForRead } from "@/lib/auth/session";
import { comments, leaderboard } from "@/lib/services/community";
import CommunityCommentForm from "./CommunityCommentForm";

export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const user = await getCurrentUserForRead();
  const [items, leaders] = await Promise.all([comments("GENERAL", 1), leaderboard()]);

  return (
    <>
      <AppTopbar pageTitle="Cộng đồng" pageSubtitle="Trao đổi kinh nghiệm và chia sẻ nội dung học tập" userName={user?.displayName} userEmail={user?.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">
        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="space-y-4">
            <div className="p-5 rounded-xl bg-surface border border-line">
              <h2 className="text-xl font-bold text-ink">Thảo luận chung</h2>
              <p className="text-sm text-muted">Chia sẻ ghi chú học tập và đặt câu hỏi.</p>
              <CommunityCommentForm signedIn={Boolean(user)} />
            </div>
            {items.map((comment) => (
              <article key={comment.id} className="p-4 rounded-xl bg-surface border border-line">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm text-ink">{comment.displayName || comment.email || "Người học"}</strong>
                  <span className="text-xs text-muted">{formatDate(comment.createdAtMillis)}</span>
                </div>
                <p className="text-sm text-ink2 mt-2 whitespace-pre-wrap">{comment.content}</p>
              </article>
            ))}
          </div>

          <aside className="space-y-4">
            <section className="p-5 rounded-xl bg-surface border border-line">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-ink">Bảng xếp hạng</h2>
                <Link href="/community/leaderboard" className="text-xs text-primary-ink font-semibold">Xem tất cả</Link>
              </div>
              <div className="space-y-2 mt-4">
                {leaders.slice(0, 8).map((entry) => (
                  <div key={entry.uid} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{entry.rankPosition}. {entry.displayName || entry.email || "Người học"}</span>
                    <strong className="text-primary">{entry.score.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            </section>
            <Link href="/community/contribute" className="block p-5 rounded-xl bg-surface-soft border border-line text-ink font-semibold">
              Đóng góp nội dung
            </Link>
          </aside>
        </section>
      </main>
    </>
  );
}

function formatDate(value: number | null) {
  return value ? new Date(value).toLocaleString() : "";
}
