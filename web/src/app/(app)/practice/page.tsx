import Link from "@/components/IntentLink";
import { findTests, getHistory } from "@/lib/services/practice";
import PracticeTestLauncher, { type PracticeTestUserStat } from "./PracticeTestLauncher";
import PracticePageHeading from "./PracticePageHeading";
import styles from "../listen/_components/listening.module.css";
import { getReadIdentity } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PracticePage({ searchParams }: Props) {
  const sp = await searchParams;
  const cursor = typeof sp.cursor === "string" ? sp.cursor : null;
  const [tests, user] = await Promise.all([
    findTests(
      sp.type as string | undefined,
      sp.difficulty as string | undefined,
      cursor,
      10,
    ),
    getReadIdentity(),
  ]);

  const history = user?.uid
    ? await getHistory(user.uid, 50).catch(() => ({ items: [] }))
    : { items: [] };

  const testStatsByTestId: Record<number, PracticeTestUserStat> = {};
  for (const attempt of history.items) {
    const projected = attempt.scoreBreakdown.totalProjectedScore
      ?? attempt.scoreBreakdown.listening?.projectedScaledScore
      ?? attempt.scoreBreakdown.reading?.projectedScaledScore
      ?? null;
    const maxScore = attempt.scoreBreakdown.maxScore || 990;
    const existing = testStatsByTestId[attempt.testId];
    if (!existing) {
      testStatsByTestId[attempt.testId] = {
        attemptCount: 1,
        bestScore: attempt.score,
        bestProjectedScore: projected,
        maxScore,
        latestAttemptId: attempt.attemptId,
      };
    } else {
      existing.attemptCount += 1;
      if (attempt.score > existing.bestScore) {
        existing.bestScore = attempt.score;
      }
      if (projected != null && (existing.bestProjectedScore == null || projected > existing.bestProjectedScore)) {
        existing.bestProjectedScore = projected;
        existing.maxScore = maxScore;
      }
    }
  }

  return (
      <main className={`${styles.dashboard} w-full min-w-0 flex-1 space-y-6`}>
        <PracticePageHeading title="Luyện đề TOEIC" subtitle="Thi thử trọn bộ hoặc luyện từng Part, theo nhịp học của bạn." />
        <PracticeTestLauncher
          tests={tests.items}
          userUid={user?.uid ?? null}
          testStatsByTestId={testStatsByTestId}
        />

        {tests.items.length === 0 && (
          <section className="practice-empty-state p-8 rounded-xl bg-surface border border-line text-center text-muted">
            Chưa có đề thi phù hợp.
          </section>
        )}

        {tests.nextCursor && (
          <div className="flex justify-end">
            <Link
              href={`/practice?cursor=${encodeURIComponent(tests.nextCursor)}`}
              className="practice-next-link px-4 py-2 rounded-lg bg-surface border border-line text-sm font-semibold text-ink"
            >
              Trang tiếp
            </Link>
          </div>
        )}
      </main>
  );
}
