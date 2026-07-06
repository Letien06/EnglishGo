"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PracticeQuestion, PracticeSessionView } from "@/lib/services/practice";

type PracticeAnswers = Record<string, { selectedOptionId: number | null; textResponse: string | null }>;
type PracticeDraftPayload = { answers: PracticeAnswers; markedQuestionIds: number[] };

function readInitialDraft(storageKey: string, draftPayload: string): PracticeDraftPayload {
  if (typeof window === "undefined") return { answers: {}, markedQuestionIds: [] };
  const raw = window.localStorage.getItem(storageKey) || draftPayload || "{}";
  try {
    const parsed = JSON.parse(raw) as Partial<PracticeDraftPayload>;
    return {
      answers: parsed.answers || {},
      markedQuestionIds: Array.isArray(parsed.markedQuestionIds) ? parsed.markedQuestionIds : [],
    };
  } catch {
    return { answers: {}, markedQuestionIds: [] };
  }
}

function initialRemainingSeconds(session: PracticeSessionView): number {
  const millis = session.expiresAtMillis - session.serverNowMillis;
  return Math.max(Math.ceil(millis / 1000), 0);
}

function formatDuration(totalSeconds: number): string {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export default function PracticeSessionClient({ session }: { session: PracticeSessionView }) {
  const router = useRouter();
  const storageKey = `practice:${session.config.sessionKey}`;
  const initialDraft = useMemo(() => readInitialDraft(storageKey, session.draftPayload), [session.draftPayload, storageKey]);
  const [answers, setAnswers] = useState<PracticeAnswers>(initialDraft.answers);
  const [markedQuestionIds, setMarkedQuestionIds] = useState<Set<number>>(() => new Set(initialDraft.markedQuestionIds));
  const [status, setStatus] = useState("Draft not saved yet");
  const [remaining, setRemaining] = useState(() => initialRemainingSeconds(session));
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState(() => session.questions[0]?.id ?? 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  const markedRef = useRef(markedQuestionIds);
  const submittingRef = useRef(false);
  const submitRef = useRef<(reason?: "manual" | "timeout") => void>(() => {});

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    markedRef.current = markedQuestionIds;
  }, [markedQuestionIds]);

  const answeredCount = useMemo(
    () => session.questions.filter((question) => hasAnswer(answers[String(question.id)])).length,
    [answers, session.questions],
  );
  const totalQuestions = session.questions.length;
  const questionIndexById = useMemo(
    () => new Map(session.questions.map((question, index) => [question.id, index])),
    [session.questions],
  );
  const questionsByPart = useMemo(() => {
    const grouped = new Map<number, PracticeQuestion[]>();
    for (const question of session.questions) {
      const items = grouped.get(question.part) ?? [];
      items.push(question);
      grouped.set(question.part, items);
    }
    return grouped;
  }, [session.questions]);
  const activeIndex = Math.max(0, questionIndexById.get(activeQuestionId) ?? 0);
  const activeQuestion = session.questions[activeIndex] ?? session.questions[0];
  const currentAudioUrl = activeQuestion?.audioUrl || null;
  const hasListening = session.questions.some((question) => question.part <= 4);
  const timerClass = remaining <= 60 ? "bg-red-600 text-white" : remaining <= 300 ? "bg-amber-500 text-white" : "bg-accent text-white";
  const title = session.config.mode === "exam"
    ? `TOEIC Full Test: Questions ${activeIndex + 1} of ${totalQuestions}`
    : `${partLabel(session.config.parts)}: Questions ${activeIndex + 1} of ${totalQuestions}`;

  function persistLocal(nextAnswers = answersRef.current, nextMarked = markedRef.current) {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        answers: nextAnswers,
        markedQuestionIds: [...nextMarked],
        config: session.config,
      }),
    );
  }

  function queueSave() {
    setStatus("Changes pending");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(), 12000);
  }

  function setAnswer(questionId: number, value: { selectedOptionId?: number | null; textResponse?: string | null }) {
    if (submittingRef.current) return;
    setAnswers((current) => {
      const previous = current[String(questionId)] ?? { selectedOptionId: null, textResponse: null };
      const next = {
        ...current,
        [questionId]: {
          selectedOptionId: Object.prototype.hasOwnProperty.call(value, "selectedOptionId") ? value.selectedOptionId ?? null : previous.selectedOptionId,
          textResponse: Object.prototype.hasOwnProperty.call(value, "textResponse") ? value.textResponse ?? null : previous.textResponse,
        },
      };
      answersRef.current = next;
      persistLocal(next, markedRef.current);
      return next;
    });
    queueSave();
  }

  function clearAnswer(questionId: number) {
    setAnswer(questionId, { selectedOptionId: null, textResponse: null });
  }

  function toggleMarked(questionId: number) {
    setMarkedQuestionIds((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      markedRef.current = next;
      persistLocal(answersRef.current, next);
      return next;
    });
    queueSave();
  }

  async function saveNow() {
    const payload = JSON.stringify({
      answers: answersRef.current,
      markedQuestionIds: [...markedRef.current],
      config: session.config,
    });
    window.localStorage.setItem(storageKey, payload);
    const response = await fetch(`/api/practice/tests/${session.test.id}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload,
        mode: session.config.mode,
        parts: session.config.parts,
        durationMinutes: session.config.durationMinutes,
      }),
    });
    const result = await response.json();
    setStatus(response.ok && result.success ? `Saved at ${new Date().toLocaleTimeString()}` : result.error || "Save failed");
  }

  async function submit(reason: "manual" | "timeout" = "manual") {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setConfirmSubmit(false);
    setStatus(reason === "timeout" ? "Hết giờ, đang nộp bài..." : "Đang nộp bài...");
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    persistLocal();
    const payload = Object.entries(answersRef.current).map(([questionId, answer]) => ({
      questionId: Number(questionId),
      selectedOptionId: answer.selectedOptionId,
      textResponse: answer.textResponse,
    }));
    setStatus("Đang chấm điểm và tạo kết quả...");
    let response: Response;
    let result: { success?: boolean; data?: { attemptId: number }; error?: string };
    try {
      response = await fetch(`/api/practice/tests/${session.test.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: session.config.mode,
          parts: session.config.parts,
          durationMinutes: session.config.durationMinutes,
          answers: payload,
        }),
      });
      result = await response.json();
    } catch {
      setStatus("Không thể nộp bài. Vui lòng kiểm tra kết nối và thử lại.");
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    if (!response.ok || !result.success) {
      setStatus(result.error || "Submit failed");
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    window.localStorage.removeItem(storageKey);
    router.replace(`/practice/review/${result.data!.attemptId}`);
  }

  function goToQuestion(questionId: number) {
    setActiveQuestionId(questionId);
    window.requestAnimationFrame(() => {
      document.getElementById(`q-${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function goByOffset(offset: number) {
    const next = session.questions[activeIndex + offset];
    if (next) goToQuestion(next.id);
  }

  function toggleAudio() {
    if (!audioRef.current || !currentAudioUrl) return;
    if (audioRef.current.paused) void audioRef.current.play();
    else audioRef.current.pause();
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

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (submittingRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-white">
      <header className="sticky top-0 z-40 flex min-h-16 flex-wrap items-center justify-between gap-3 bg-[#1e3f68] px-4 py-3 text-white shadow">
        <button
          type="button"
          onClick={() => setConfirmExit(true)}
          className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20"
        >
          ← Thoát
        </button>
        <h1 className="min-w-0 flex-1 text-center text-lg font-extrabold">{title}</h1>
        <div className="flex items-center gap-2">
          {hasListening ? (
            <button
              type="button"
              onClick={toggleAudio}
              disabled={!currentAudioUrl}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent font-bold disabled:opacity-50"
              title={currentAudioUrl ? "Phát audio câu hiện tại" : "Câu hiện tại không có audio"}
            >
              🔊
            </button>
          ) : null}
          <span className="rounded-lg bg-white px-3 py-2 text-sm font-extrabold text-[#1e3f68]">
            {answeredCount}/{totalQuestions}
          </span>
          <span className={`rounded-lg px-3 py-2 text-sm font-extrabold ${timerClass}`}>
            {formatDuration(remaining)}
          </span>
          <button
            type="button"
            onClick={() => setConfirmSubmit(true)}
            disabled={submitting}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60"
          >
            {submitting ? "Đang nộp..." : "Submit"}
          </button>
        </div>
      </header>

      {currentAudioUrl ? <audio ref={audioRef} src={currentAudioUrl} /> : null}
      {submitting ? (
        <PracticeBusyOverlay
          title={remaining === 0 ? "Hết giờ, đang nộp bài..." : "Đang nộp bài..."}
          description={status || "Đang chấm điểm và tạo kết quả."}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 px-4 py-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5">
          {activeQuestion ? (
            <QuestionCard
              key={activeQuestion.id}
              question={activeQuestion}
              index={activeIndex}
              answer={answers[String(activeQuestion.id)] ?? { selectedOptionId: null, textResponse: null }}
              marked={markedQuestionIds.has(activeQuestion.id)}
              active
              options={session.optionsByQuestionId[String(activeQuestion.id)] ?? []}
              disabled={submitting}
              onFocus={() => setActiveQuestionId(activeQuestion.id)}
              onAnswer={(selectedOptionId) => setAnswer(activeQuestion.id, { selectedOptionId })}
              onTextAnswer={(textResponse) => setAnswer(activeQuestion.id, { textResponse })}
              onClear={() => clearAnswer(activeQuestion.id)}
              onToggleMarked={() => toggleMarked(activeQuestion.id)}
              onPrevious={() => goByOffset(-1)}
              onNext={() => goByOffset(1)}
              previousDisabled={activeIndex === 0}
              nextDisabled={activeIndex === session.questions.length - 1}
            />
          ) : null}
        </section>

        <aside className="h-fit rounded-xl border border-line bg-surface p-5 shadow-sm xl:sticky xl:top-24">
          <div className="flex items-center justify-between">
            <strong className="text-ink">Navigator</strong>
            <span className="text-xs font-bold text-muted">{status}</span>
          </div>
          <div className="mt-4 space-y-4">
            {session.config.parts.map((part) => {
              const questions = questionsByPart.get(part) ?? [];
              if (questions.length === 0) return null;
              return (
                <section key={part}>
                  <button type="button" onClick={() => goToQuestion(questions[0]!.id)} className="mb-2 text-xs font-extrabold text-muted">
                    Part {part}
                  </button>
                  <div className="grid grid-cols-5 gap-2">
                    {questions.map((question) => {
                      const globalIndex = (questionIndexById.get(question.id) ?? 0) + 1;
                      const answered = hasAnswer(answers[String(question.id)]);
                      const marked = markedQuestionIds.has(question.id);
                      const active = question.id === activeQuestionId;
                      return (
                        <button
                          key={question.id}
                          type="button"
                          onClick={() => goToQuestion(question.id)}
                          className={`relative rounded-lg border px-2 py-1 text-center text-sm font-bold ${
                            active
                              ? "border-accent bg-accent text-white"
                              : answered
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-line bg-surface-soft text-ink"
                          }`}
                        >
                          {globalIndex}
                          {marked ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => void saveNow()} disabled={submitting} className="flex-1 rounded-lg bg-surface-soft px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60">
              Save
            </button>
            <button type="button" onClick={() => setConfirmSubmit(true)} disabled={submitting} className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Submit
            </button>
          </div>
        </aside>
      </div>

      {confirmSubmit ? (
        <ConfirmDialog
          title="Xác nhận nộp bài?"
          description={`Sau khi nộp bài, bạn sẽ không thể thay đổi câu trả lời. Đã làm ${answeredCount}/${totalQuestions} câu.${answeredCount < totalQuestions ? ` Còn ${totalQuestions - answeredCount} câu chưa trả lời.` : ""}`}
          confirmLabel="Nộp bài"
          onCancel={() => setConfirmSubmit(false)}
          onConfirm={() => void submit("manual")}
        />
      ) : null}

      {confirmExit ? (
        <ConfirmDialog
          title="Thoát bài thi?"
          description="Đáp án nháp đã lưu sẽ được giữ lại cho đúng cấu hình bài thi này."
          confirmLabel="Thoát"
          onCancel={() => setConfirmExit(false)}
          onConfirm={() => router.push("/practice")}
        />
      ) : null}
    </main>
  );
}

function QuestionCard({
  question,
  index,
  answer,
  marked,
  active,
  options,
  disabled,
  onFocus,
  onAnswer,
  onTextAnswer,
  onClear,
  onToggleMarked,
  onPrevious,
  onNext,
  previousDisabled,
  nextDisabled,
}: {
  question: PracticeQuestion;
  index: number;
  answer: { selectedOptionId: number | null; textResponse: string | null };
  marked: boolean;
  active: boolean;
  options: Array<{ id: number; content: string }>;
  disabled: boolean;
  onFocus: () => void;
  onAnswer: (selectedOptionId: number) => void;
  onTextAnswer: (textResponse: string) => void;
  onClear: () => void;
  onToggleMarked: () => void;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled: boolean;
  nextDisabled: boolean;
}) {
  const showPassage = Boolean(question.group && question.part >= 6);
  const showQuestionText = shouldShowQuestionText(question.part) && question.content.trim().length > 0;
  const showOptionText = shouldShowOptionText(question.part);
  const imageFirst = question.part === 1;
  return (
    <article
      id={`q-${question.id}`}
      onFocus={onFocus}
      onMouseEnter={onFocus}
      className={`rounded-xl border bg-surface p-5 shadow-sm ${active ? "border-accent" : "border-line"}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold text-muted">Part {question.part}</p>
          <h2 className="text-lg font-extrabold text-ink">Question {index + 1}</h2>
        </div>
        <div className="flex gap-2">
          {hasAnswer(answer) ? (
            <button type="button" onClick={onClear} disabled={disabled} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-muted disabled:opacity-60">
              Xóa đáp án
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleMarked}
            disabled={disabled}
            className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-60 ${marked ? "bg-amber-100 text-amber-700" : "border border-line text-muted"}`}
          >
            {marked ? "Đã đánh dấu" : "Đánh dấu"}
          </button>
        </div>
      </header>

      {showPassage && question.group ? (
        <div className="mt-4 rounded-lg bg-surface-soft p-4 text-sm leading-relaxed text-ink2 whitespace-pre-wrap">
          {question.group.passageText}
        </div>
      ) : null}
      {showQuestionText ? <p className="mt-4 whitespace-pre-wrap text-sm font-semibold text-ink">{question.content}</p> : null}
      {imageFirst && question.imageUrl ? <img src={question.imageUrl} alt="Question media" className="mt-4 max-h-[520px] max-w-full rounded-lg border border-line object-contain" /> : null}
      {question.audioUrl ? <audio controls src={question.audioUrl} className="mt-4 w-full" /> : null}
      {!imageFirst && question.imageUrl ? <img src={question.imageUrl} alt="Question media" className="mt-4 max-h-[520px] max-w-full rounded-lg border border-line object-contain" /> : null}

      {options.length > 0 ? (
        <div className="mt-5 space-y-3">
          {options.map((option, optionIndex) => {
            const selected = answer.selectedOptionId === option.id;
            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${selected ? "border-accent bg-accent/5" : "border-line bg-surface-soft"}`}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={selected}
                  onChange={() => onAnswer(option.id)}
                  disabled={disabled}
                  className="mt-1"
                />
                <span className={`text-sm text-ink ${showOptionText ? "" : "font-extrabold"}`}>
                  {showOptionText ? option.content : optionLabel(option.content, optionIndex)}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <textarea
          value={answer.textResponse ?? ""}
          onChange={(event) => onTextAnswer(event.target.value)}
          disabled={disabled}
          className="mt-5 min-h-28 w-full rounded-lg border border-line bg-surface-soft px-3 py-2 text-ink"
          placeholder="Answer"
        />
      )}

      <footer className="mt-5 flex flex-wrap justify-between gap-2">
        <button type="button" onClick={onPrevious} disabled={previousDisabled || disabled} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink disabled:opacity-40">
          Câu trước
        </button>
        <button type="button" onClick={onNext} disabled={nextDisabled || disabled} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
          Câu tiếp
        </button>
      </footer>
    </article>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <section className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-2xl">
        <h2 className="text-xl font-extrabold text-ink">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink">
            Quay lại
          </button>
          <button type="button" onClick={onConfirm} className="rounded-lg bg-accent px-4 py-2 text-sm font-extrabold text-white">
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function PracticeBusyOverlay({ title, description }: { title: string; description: string }) {
  return (
    <div className="app-busy-overlay">
      <section className="app-busy-card">
        <span className="app-busy-spinner" />
        <div>
          <h2 className="app-busy-title">{title}</h2>
          <p className="app-busy-description">{description}</p>
        </div>
      </section>
    </div>
  );
}

function hasAnswer(answer: { selectedOptionId: number | null; textResponse: string | null } | undefined): boolean {
  return Boolean(answer?.selectedOptionId != null || answer?.textResponse?.trim());
}

function partLabel(parts: number[]): string {
  if (parts.length === 1) return `Part ${parts[0]}`;
  return `Parts ${parts.join(", ")}`;
}

function shouldShowQuestionText(part: number): boolean {
  return part >= 3;
}

function shouldShowOptionText(part: number): boolean {
  return part >= 3;
}

function optionLabel(content: string, index: number): string {
  const match = content.trim().match(/^([A-D])(?:[.)]\s*|\s+)/i);
  if (match?.[1]) return match[1].toUpperCase();
  return String.fromCharCode(65 + index);
}
