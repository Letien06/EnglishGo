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
      <AppTopbar pageTitle="Lịch sử làm bài" pageSubtitle="Xem lại đáp án đã nộp" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <section className="rounded-xl bg-surface border border-line overflow-hidden">
          {history.items.length === 0 ? (
            <div className="p-8 text-center text-muted">Chưa có bài làm nào đã nộp.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-soft text-muted">
                <tr>
                  <th className="text-left p-3">Bài thi</th>
                  <th className="text-left p-3">Chế độ</th>
                  <th className="text-left p-3">Điểm</th>
                  <th className="text-left p-3">Xếp hạng</th>
                  <th className="text-left p-3">Thời gian</th>
                  <th className="text-left p-3">Đã nộp</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {history.items.map((attempt) => (
                  <tr key={attempt.attemptId} className="border-t border-line">
                    <td className="p-3 text-ink">
                      <div className="font-bold">{attempt.title}</div>
                      <div className="text-xs text-muted">{attempt.correctCount}/{attempt.questionCount} câu đúng</div>
                    </td>
                    <td className="p-3 text-muted">{attempt.mode === "exam" ? "Đề đầy đủ" : partLabel(attempt.parts)}</td>
                    <td className="p-3">
                      <div className="font-bold text-ink">{attempt.score}%</div>
                      <div className="text-xs text-muted">{scoreLabel(attempt.scoreBreakdown)}</div>
                    </td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${eligibilityClass(attempt.leaderboardEligibility)}`}>
                        {eligibilityLabel(attempt.leaderboardEligibility)}
                      </span>
                    </td>
                    <td className="p-3 text-muted">{formatElapsed(attempt.elapsedMillis)}</td>
                    <td className="p-3 text-muted">{formatDate(attempt.submittedAtMillis)}</td>
                    <td className="p-3 text-right space-x-3">
                      <Link href={`/practice/review/${attempt.attemptId}`} className="text-accent font-semibold">
                        Xem lại
                      </Link>
                      <Link
                        href={`/practice/session/${attempt.testId}?mode=${attempt.mode}&parts=${attempt.parts.join(",")}&time=${attempt.durationMinutes}`}
                        className="text-muted font-semibold"
                      >
                        Làm lại
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
              Trang tiếp
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

function scoreLabel(score: { totalProjectedScore: number | null; maxScore: number; listening: { projectedScaledScore: number } | null; reading: { projectedScaledScore: number } | null }) {
  if (score.totalProjectedScore != null) return `~${score.totalProjectedScore}/${score.maxScore} TOEIC`;
  return `~${score.listening?.projectedScaledScore ?? score.reading?.projectedScaledScore ?? 5}/495 TOEIC`;
}

function formatElapsed(value: number) {
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} phút ${seconds} giây`;
}

function partLabel(parts: number[]) {
  if (parts.length === 1) return `Phần ${parts[0]}`;
  return `Phần ${parts.join(", ")}`;
}

function eligibilityLabel(value: string) {
  if (value === "VERIFIED") return "Hợp lệ";
  if (value === "SUSPICIOUS") return "Không tính";
  return "Làm lại";
}

function eligibilityClass(value: string) {
  if (value === "VERIFIED") return "bg-emerald-50 text-emerald-700";
  if (value === "SUSPICIOUS") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}
