import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { requireUser } from "@/lib/auth/session";
import { getHistory } from "@/lib/services/practice";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PracticeHistoryPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  const cursor = typeof sp.cursor === "string" ? sp.cursor : null;
  const history = await getHistory(user.uid, 10, cursor);

  return (
    <>
      <AppTopbar pageTitle="Attempt history" pageSubtitle="Review submitted answers" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <section className="rounded-xl bg-surface border border-line overflow-hidden">
          {history.items.length === 0 ? (
            <div className="p-8 text-center text-muted">No submitted attempts yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-soft text-muted">
                <tr>
                  <th className="text-left p-3">Test</th>
                  <th className="text-left p-3">Score</th>
                  <th className="text-left p-3">Submitted</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {history.items.map((attempt) => (
                  <tr key={attempt.attemptId} className="border-t border-line">
                    <td className="p-3 text-ink">{attempt.title}</td>
                    <td className="p-3 font-bold text-ink">{attempt.score}</td>
                    <td className="p-3 text-muted">{formatDate(attempt.submittedAtMillis)}</td>
                    <td className="p-3 text-right">
                      <Link href={`/practice/review/${attempt.attemptId}`} className="text-accent font-semibold">
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {history.nextCursor && (
          <div className="mt-4 flex justify-end">
            <Link
              href={`/practice/history?cursor=${encodeURIComponent(history.nextCursor)}`}
              className="px-4 py-2 rounded-lg bg-surface border border-line text-sm font-semibold text-ink"
            >
              Next
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

function formatDate(value: number | null) {
  return value ? new Date(value).toLocaleString() : "-";
}
