"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PracticeSessionView } from "@/lib/services/practice";

type PracticeAnswers = Record<string, { selectedOptionId: number | null; textResponse: string | null }>;

function readInitialAnswers(storageKey: string, draftPayload: string): PracticeAnswers {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(storageKey) || draftPayload || "{}";
  try {
    const parsed = JSON.parse(raw);
    return parsed.answers || {};
  } catch {
    return {};
  }
}

function initialRemainingSeconds(session: PracticeSessionView): number {
  const millis = session.expiresAtMillis - session.serverNowMillis;
  return Math.max(Math.ceil(millis / 1000), 0);
}

export default function PracticeSessionClient({ session }: { session: PracticeSessionView }) {
  const router = useRouter();
  const storageKey = `practice:${session.test.id}:answers`;
  const [answers, setAnswers] = useState<PracticeAnswers>(() =>
    readInitialAnswers(storageKey, session.draftPayload),
  );
  const [status, setStatus] = useState("Draft not saved yet");
  const [remaining, setRemaining] = useState(() =>
    initialRemainingSeconds(session),
  );
  const [submitting, setSubmitting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  const submittingRef = useRef(false);
  const submitRef = useRef<(reason?: "manual" | "timeout") => void>(() => {});

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const timerLabel = useMemo(() => {
    const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
    const seconds = String(remaining % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [remaining]);

  function setAnswer(questionId: number, value: { selectedOptionId?: number | null; textResponse?: string | null }) {
    if (submittingRef.current) return;
    setAnswers((current) => {
      const next = {
        ...current,
        [questionId]: {
          selectedOptionId: value.selectedOptionId ?? current[String(questionId)]?.selectedOptionId ?? null,
          textResponse: value.textResponse ?? current[String(questionId)]?.textResponse ?? null,
        },
      };
      answersRef.current = next;
      window.localStorage.setItem(storageKey, JSON.stringify({ answers: next }));
      return next;
    });
    setStatus("Changes pending");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(), 15000);
  }

  async function saveNow() {
    const payload = JSON.stringify({ answers: answersRef.current });
    window.localStorage.setItem(storageKey, payload);
    const response = await fetch(`/api/practice/tests/${session.test.id}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    const result = await response.json();
    setStatus(response.ok && result.success ? `Saved at ${new Date().toLocaleTimeString()}` : result.error || "Save failed");
  }

  async function submit(reason: "manual" | "timeout" = "manual") {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setStatus(reason === "timeout" ? "Time is up. Submitting..." : "Submitting...");
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await saveNow();
    const payload = Object.entries(answersRef.current).map(([questionId, answer]) => ({
      questionId: Number(questionId),
      selectedOptionId: answer.selectedOptionId,
      textResponse: answer.textResponse,
    }));
    const response = await fetch(`/api/practice/tests/${session.test.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: payload }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setStatus(result.error || "Submit failed");
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    window.localStorage.removeItem(storageKey);
    router.push(`/practice/review/${result.data.attemptId}`);
  }

  useEffect(() => {
    submitRef.current = (reason) => void submit(reason);
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          submitRef.current("timeout");
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-6">
        <section className="space-y-4">
          {session.questions.map((question, index) => {
            const answer = answers[String(question.id)] ?? { selectedOptionId: null, textResponse: null };
            const options = session.optionsByQuestionId[String(question.id)] ?? [];
            return (
              <article key={question.id} id={`q-${question.id}`} className="p-5 rounded-xl bg-surface border border-line space-y-4">
                <header>
                  <h2 className="font-bold text-ink">
                    Question {index + 1} <span className="text-xs text-muted">(Part {question.part})</span>
                  </h2>
                </header>
                {question.group && (
                  <div className="p-4 rounded-lg bg-surface-soft text-sm text-ink2 whitespace-pre-wrap">
                    {question.group.passageText}
                  </div>
                )}
                <p className="text-sm text-ink whitespace-pre-wrap">{question.content}</p>
                {question.audioUrl && <audio controls src={question.audioUrl} className="w-full" />}
                {question.imageUrl && <img src={question.imageUrl} alt="Question media" className="max-w-full rounded-lg border border-line" />}
                {options.length > 0 ? (
                  <div className="space-y-2">
                    {options.map((option) => (
                      <label key={option.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface-soft cursor-pointer">
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={option.id}
                          checked={answer.selectedOptionId === option.id}
                          onChange={() => setAnswer(question.id, { selectedOptionId: option.id })}
                          disabled={submitting}
                          className="mt-1"
                        />
                        <span className="text-sm text-ink">{option.content}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={answer.textResponse ?? ""}
                    onChange={(event) => setAnswer(question.id, { textResponse: event.target.value })}
                    disabled={submitting}
                    className="w-full min-h-28 px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink"
                    placeholder="Answer"
                  />
                )}
              </article>
            );
          })}
        </section>

        <aside className="xl:sticky xl:top-4 h-fit p-5 rounded-xl bg-surface border border-line space-y-4">
          <div className="flex items-center justify-between">
            <strong className="text-ink">Questions</strong>
            <span className="px-2 py-1 rounded bg-primary-soft text-primary text-sm font-bold">{timerLabel}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {session.questions.map((question, index) => (
              <a key={question.id} href={`#q-${question.id}`} className="text-center px-2 py-1 rounded bg-surface-soft text-sm text-ink">
                {index + 1}
              </a>
            ))}
          </div>
          <p className="text-xs text-muted">{status}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void saveNow()} disabled={submitting} className="flex-1 px-3 py-2 rounded-lg bg-surface-soft text-ink text-sm font-semibold disabled:opacity-60">
              Save
            </button>
            <button type="button" onClick={() => void submit()} disabled={submitting} className="flex-1 px-3 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-60">
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
          <Link href="/practice" className="block text-center text-xs text-muted">
            Exit
          </Link>
        </aside>
      </div>
    </main>
  );
}
