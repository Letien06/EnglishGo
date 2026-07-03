import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { requireUser } from "@/lib/auth/session";
import { getAttemptReview } from "@/lib/services/practice";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ attemptId: string }>;
}

export default async function PracticeReviewPage({ params }: Props) {
  const user = await requireUser();
  const { attemptId } = await params;
  const review = await getAttemptReview(user.uid, Number(attemptId));

  return (
    <>
      <AppTopbar pageTitle="Review answers" pageSubtitle={review.attempt.title} userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-4">
        <section className="p-5 rounded-xl bg-surface border border-line">
          <span className="text-xs text-muted">Score</span>
          <h1 className="text-3xl font-bold text-ink">{review.attempt.score}</h1>
          <p className="text-sm text-muted">
            {review.attempt.correctCount}/{review.attempt.questionCount} correct
          </p>
          <Link href="/practice/history" className="text-sm text-accent font-semibold">
            Back to history
          </Link>
        </section>

        {review.answers.map((answer, index) => (
          <article key={`${answer.questionId}-${index}`} className="p-5 rounded-xl bg-surface border border-line space-y-3">
            <h2 className="font-bold text-ink">Question {index + 1}</h2>
            <p className="text-sm text-ink whitespace-pre-wrap">{answer.questionText}</p>
            <p className={`text-sm font-bold ${answer.correct ? "text-green-500" : "text-red-500"}`}>
              {answer.correct ? "Correct" : "Incorrect"}
            </p>
            <div className="space-y-2">
              {answer.options.map((option) => (
                <div key={option.id} className={`p-3 rounded-lg bg-surface-soft text-sm ${answer.selectedOptionId === option.id ? "ring-1 ring-accent" : ""}`}>
                  <span>{option.content}</span>
                  {option.correct && <span className="text-green-500 font-semibold"> - correct answer</span>}
                  {answer.selectedOptionId === option.id && <span className="text-muted"> - your choice</span>}
                </div>
              ))}
            </div>
            {answer.explanation && <p className="text-sm text-muted whitespace-pre-wrap">{answer.explanation}</p>}
          </article>
        ))}
      </main>
    </>
  );
}
