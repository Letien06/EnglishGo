import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { requireUser } from "@/lib/auth/session";
import { getAttemptReview } from "@/lib/services/practice";
import type { PracticeSkillBreakdown } from "@/lib/services/practice";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ attemptId: string }>;
}

export default async function PracticeReviewPage({ params }: Props) {
  const user = await requireUser();
  const { attemptId } = await params;
  const review = await getAttemptReview(user.uid, Number(attemptId));
  const attempt = review.attempt;
  const scoreBreakdown = attempt.scoreBreakdown;
  const accuracy = attempt.questionCount > 0 ? Math.round((attempt.correctCount * 100) / attempt.questionCount) : 0;
  const retryHref = `/practice/session/${attempt.testId}?mode=${attempt.mode}&parts=${attempt.parts.join(",")}&time=${attempt.durationMinutes}`;

  return (
    <>
      <AppTopbar pageTitle="Kết quả bài thi" pageSubtitle={attempt.title} userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto bg-[#f6f8fb] px-4 py-8 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-3xl text-sky-600">
              ♛
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-ink">Hoàn thành bài thi!</h1>
            <p className="mt-1 text-sm text-muted">{attempt.title}</p>
          </section>

          <section className="rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
            <strong className="text-6xl text-accent">{attempt.correctCount}</strong>
            <p className="mt-2 text-lg text-ink">/ {attempt.questionCount} câu đúng</p>
            <p className="mt-2 text-sm text-muted">({accuracy}% chính xác)</p>
            <div className="mt-5 rounded-xl bg-surface-soft p-4">
              <p className="text-xs font-extrabold uppercase text-muted">TOEIC projected score</p>
              <p className="mt-1 text-3xl font-extrabold text-ink">
                {scoreBreakdown.totalProjectedScore != null
                  ? `${scoreBreakdown.totalProjectedScore}/${scoreBreakdown.maxScore}`
                  : `${scoreBreakdown.listening?.projectedScaledScore ?? scoreBreakdown.reading?.projectedScaledScore ?? 5}/495`}
              </p>
              <p className="mt-1 text-xs text-muted">Ước tính theo tỷ lệ đúng; điểm TOEIC thật có thể khác theo form đề.</p>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs font-bold text-muted">
              <span className="rounded-full bg-surface-soft px-3 py-1">{attempt.mode === "exam" ? "Full Test" : `Thi theo ${partLabel(attempt.parts)}`}</span>
              <span className="rounded-full bg-surface-soft px-3 py-1">{attempt.durationMinutes} phút cấu hình</span>
              <span className="rounded-full bg-surface-soft px-3 py-1">{formatElapsed(attempt.elapsedMillis)} đã làm</span>
              {attempt.expired ? <span className="rounded-full bg-red-50 px-3 py-1 text-red-600">Quá giờ</span> : null}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <SkillScoreCard title="Listening" score={scoreBreakdown.listening} />
            <SkillScoreCard title="Reading" score={scoreBreakdown.reading} />
          </section>

          <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-extrabold text-ink">Phân tích theo Part</h2>
            <div className="mt-5 space-y-4">
              {attempt.partBreakdown.length > 0 ? (
                attempt.partBreakdown.map((part) => {
                  const percent = part.total > 0 ? Math.round((part.correct * 100) / part.total) : 0;
                  return (
                    <div key={part.part}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-bold text-ink">{part.part <= 4 ? "🎧" : "📖"} Part {part.part}</span>
                        <span className="text-muted">{part.correct}/{part.total} ({percent}%) · ~{part.projectedScaledScore}/495 · ~{part.questionWeight}đ/câu</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-soft">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted">Chưa có dữ liệu phân tích theo part.</p>
              )}
            </div>
          </section>

          <section className="flex flex-wrap justify-center gap-3">
            <a href="#review-answers" className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-bold text-ink">
              Xem lại bài thi
            </a>
            <Link href={retryHref} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-bold text-ink">
              Làm lại
            </Link>
            <Link href="/practice" className="rounded-lg bg-accent px-4 py-2 text-sm font-extrabold text-white">
              Quay lại danh sách
            </Link>
          </section>

          <section id="review-answers" className="space-y-4">
            {review.answers.map((answer, index) => (
              <article key={`${answer.questionId}-${index}`} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold text-ink">Question {index + 1} <span className="text-xs text-muted">(Part {answer.part})</span></h2>
                  <p className={`text-sm font-bold ${answer.correct ? "text-green-600" : "text-red-600"}`}>
                    {answer.correct ? "Correct" : "Incorrect"}
                  </p>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{answer.questionText}</p>
                <div className="mt-4 space-y-2">
                  {answer.options.map((option) => (
                    <div key={option.id} className={`rounded-lg p-3 text-sm ${answer.selectedOptionId === option.id ? "bg-accent/10 ring-1 ring-accent" : "bg-surface-soft"}`}>
                      <span>{option.content}</span>
                      {option.correct ? <span className="font-semibold text-green-600"> - correct answer</span> : null}
                      {answer.selectedOptionId === option.id ? <span className="text-muted"> - your choice</span> : null}
                    </div>
                  ))}
                </div>
                {answer.explanation ? <p className="mt-4 whitespace-pre-wrap text-sm text-muted">{answer.explanation}</p> : null}
              </article>
            ))}
          </section>
        </div>
      </main>
    </>
  );
}

function SkillScoreCard({
  title,
  score,
}: {
  title: string;
  score: PracticeSkillBreakdown | null;
}) {
  if (!score) {
    return (
      <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-extrabold text-ink">{title}</h2>
        <p className="mt-3 text-sm text-muted">Chưa làm section này.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-ink">{title}</h2>
          <p className="mt-1 text-xs text-muted">Parts {score.selectedParts.join(", ")} · coverage {score.coveragePercent}%</p>
        </div>
        <strong className="text-2xl text-accent">~{score.projectedScaledScore}</strong>
      </div>
      <p className="mt-4 text-sm text-ink">
        {score.correct}/{score.total} câu đúng · quy đổi ~{score.equivalentCorrect100}/100 câu section
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-soft">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, score.projectedScaledScore / 4.95))}%` }} />
      </div>
      <p className="mt-3 text-xs text-muted">Mỗi câu trong phần đang làm tương đương khoảng {score.questionWeight} điểm scaled nếu dự phóng toàn section.</p>
    </section>
  );
}

function partLabel(parts: number[]): string {
  if (parts.length === 1) return `Part ${parts[0]}`;
  return `Parts ${parts.join(", ")}`;
}

function formatElapsed(value: number): string {
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
