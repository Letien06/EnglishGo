import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { getCurrentUser } from "@/lib/auth/session";
import { leaderboard, normalizePeriod } from "@/lib/services/community";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LeaderboardPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const period = normalizePeriod(sp.period as string | undefined);
  const entries = await leaderboard(period);

  return (
    <>
      <AppTopbar pageTitle="Leaderboard" pageSubtitle="Top learners by practice score" userName={user?.displayName} userEmail={user?.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-4">
        <nav className="flex gap-2">
          <Link href="/community/leaderboard?period=all-time" className={`px-4 py-2 rounded-lg text-sm font-semibold ${period === "ALL_TIME" ? "bg-accent text-white" : "bg-surface text-ink"}`}>
            All time
          </Link>
          <Link href="/community/leaderboard?period=weekly" className={`px-4 py-2 rounded-lg text-sm font-semibold ${period === "WEEKLY" ? "bg-accent text-white" : "bg-surface text-ink"}`}>
            Weekly
          </Link>
        </nav>
        <section className="rounded-xl bg-surface border border-line overflow-hidden">
          {entries.map((entry) => (
            <div key={entry.uid} className="flex items-center justify-between p-4 border-b border-line last:border-0">
              <div>
                <strong className="text-ink">{entry.rankPosition}. {entry.displayName || entry.email || "Learner"}</strong>
                <p className="text-xs text-muted">{entry.email}</p>
              </div>
              <strong className="text-primary">{entry.score.toFixed(2)}</strong>
            </div>
          ))}
          {entries.length === 0 && <div className="p-8 text-center text-muted">No leaderboard entries yet.</div>}
        </section>
      </main>
    </>
  );
}
