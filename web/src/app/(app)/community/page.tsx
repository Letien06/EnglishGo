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
      <AppTopbar pageTitle="Community" pageSubtitle="Discuss, contribute, and track leaderboard" userName={user?.displayName} userEmail={user?.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">
        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="space-y-4">
            <div className="p-5 rounded-xl bg-surface border border-line">
              <h1 className="text-xl font-bold text-ink">General discussion</h1>
              <p className="text-sm text-muted">Share study notes and ask questions.</p>
              <CommunityCommentForm signedIn={Boolean(user)} />
            </div>
            {items.map((comment) => (
              <article key={comment.id} className="p-4 rounded-xl bg-surface border border-line">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm text-ink">{comment.displayName || comment.email || "Learner"}</strong>
                  <span className="text-xs text-muted">{formatDate(comment.createdAtMillis)}</span>
                </div>
                <p className="text-sm text-ink2 mt-2 whitespace-pre-wrap">{comment.content}</p>
              </article>
            ))}
          </div>

          <aside className="space-y-4">
            <section className="p-5 rounded-xl bg-surface border border-line">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-ink">Leaderboard</h2>
                <Link href="/community/leaderboard" className="text-xs text-accent font-semibold">View all</Link>
              </div>
              <div className="space-y-2 mt-4">
                {leaders.slice(0, 8).map((entry) => (
                  <div key={entry.uid} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{entry.rankPosition}. {entry.displayName || entry.email || "Learner"}</span>
                    <strong className="text-primary">{entry.score.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            </section>
            <Link href="/community/contribute" className="block p-5 rounded-xl bg-surface-soft border border-line text-ink font-semibold">
              Contribute content
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
