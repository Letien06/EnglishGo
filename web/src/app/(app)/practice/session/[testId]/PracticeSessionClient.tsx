"use client";

import Image from "next/image";
import MobileNavigationMenu from "@/components/MobileNavigationMenu";
import WorkspaceAnnotator, { WorkspaceAnnotationAnchor } from "@/components/WorkspaceAnnotator";
import useDialogFocus from "@/components/useDialogFocus";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PracticeQuestion, PracticeSessionView } from "@/lib/services/practice";

type PracticeAnswers = Record<string, { selectedOptionId: number | null; textResponse: string | null }>;
type PracticeDraftPayload = {
  answers: PracticeAnswers;
  markedQuestionIds: number[];
  currentQuestionIndex: number;
  startedAtMillis?: number;
  updatedAtMillis: number;
};

function readInitialDraft(storageKey: string, draftPayload: string): PracticeDraftPayload {
  if (typeof window === "undefined") return { answers: {}, markedQuestionIds: [], currentQuestionIndex: 0, updatedAtMillis: 0 };
  const raw = window.localStorage.getItem(storageKey) || draftPayload || "{}";
  return parseDraftPayload(raw);
}

function parseDraftPayload(raw: string): PracticeDraftPayload {
  try {
    const parsed = JSON.parse(raw) as Partial<PracticeDraftPayload>;
    return {
      answers: normalizeAnswers(parsed.answers),
      markedQuestionIds: Array.isArray(parsed.markedQuestionIds) ? parsed.markedQuestionIds : [],
      currentQuestionIndex: typeof parsed.currentQuestionIndex === "number" ? parsed.currentQuestionIndex : 0,
      startedAtMillis: typeof parsed.startedAtMillis === "number" ? parsed.startedAtMillis : undefined,
      updatedAtMillis: typeof parsed.updatedAtMillis === "number" ? parsed.updatedAtMillis : 0,
    };
  } catch {
    return { answers: {}, markedQuestionIds: [], currentQuestionIndex: 0, updatedAtMillis: 0 };
  }
}

function normalizeAnswers(value: unknown): PracticeAnswers {
  if (!value || typeof value !== "object") return {};
  const answers: PracticeAnswers = {};
  for (const [questionId, answer] of Object.entries(value as Record<string, unknown>)) {
    if (!answer || typeof answer !== "object") continue;
    const item = answer as { selectedOptionId?: unknown; textResponse?: unknown };
    answers[questionId] = {
      selectedOptionId: typeof item.selectedOptionId === "number" ? item.selectedOptionId : null,
      textResponse: typeof item.textResponse === "string" ? item.textResponse : null,
    };
  }
  return answers;
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

export default function PracticeSessionClient({ session, userUid }: { session: PracticeSessionView; userUid: string }) {
  const router = useRouter();
  const storageKey = `practice:${session.config.sessionKey}`;
  const initialDraft = useMemo(() => readInitialDraft(storageKey, session.draftPayload), [session.draftPayload, storageKey]);
  const [answers, setAnswers] = useState<PracticeAnswers>(initialDraft.answers);
  const [markedQuestionIds, setMarkedQuestionIds] = useState<Set<number>>(() => new Set(initialDraft.markedQuestionIds));
  const [status, setStatus] = useState("Draft not saved yet");
  const [remaining, setRemaining] = useState(() => initialRemainingSeconds(session));
  const [submitting, setSubmitting] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState(() => {
    const index = Math.min(Math.max(initialDraft.currentQuestionIndex, 0), Math.max(session.questions.length - 1, 0));
    return session.questions[index]?.id ?? session.questions[0]?.id ?? 0;
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  const markedRef = useRef(markedQuestionIds);
  const draftUpdatedAtRef = useRef(initialDraft.updatedAtMillis);
  const submittingRef = useRef(false);
  const submitRef = useRef<(reason?: "manual" | "timeout") => void>(() => {});

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    markedRef.current = markedQuestionIds;
  }, [markedQuestionIds]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      mode: session.config.mode,
      parts: session.config.parts.join(","),
      time: String(session.config.durationMinutes),
    });
    fetch(`/api/practice/tests/${session.test.id}/draft?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (response) => response.ok ? response.json() : null)
      .then((result) => {
        if (cancelled || !result?.success || !result.data?.payload) return;
        const serverDraft = parseDraftPayload(result.data.payload);
        const serverUpdatedAtMillis =
          serverDraft.updatedAtMillis || Number(result.data.updatedAtMillis) || 0;
        if (serverUpdatedAtMillis <= draftUpdatedAtRef.current) return;
        answersRef.current = serverDraft.answers;
        const nextMarked = new Set(serverDraft.markedQuestionIds);
        markedRef.current = nextMarked;
        setAnswers(serverDraft.answers);
        setMarkedQuestionIds(nextMarked);
        draftUpdatedAtRef.current = serverUpdatedAtMillis;
        window.localStorage.setItem(storageKey, result.data.payload);
        const nextQuestion = session.questions[serverDraft.currentQuestionIndex];
        if (nextQuestion) setActiveQuestionId(nextQuestion.id);
        setStatus("Loaded server draft");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.config.durationMinutes, session.config.mode, session.config.parts, session.questions, session.test.id, storageKey]);

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
  const timerClass = remaining <= 60 ? "bg-red-600 text-white" : remaining <= 300 ? "bg-amber-500 text-white" : "bg-accent text-gold-ink";
  const title = session.config.mode === "exam"
    ? `TOEIC Full Test: Questions ${activeIndex + 1} of ${totalQuestions}`
    : `${partLabel(session.config.parts)}: Questions ${activeIndex + 1} of ${totalQuestions}`;

  const makeDraftPayload = useCallback((
    nextAnswers = answersRef.current,
    nextMarked = markedRef.current,
    updatedAtMillis = Date.now(),
    currentQuestionIndex = activeIndex,
  ) => {
    draftUpdatedAtRef.current = updatedAtMillis;
    return JSON.stringify({
      answers: nextAnswers,
      markedQuestionIds: [...nextMarked],
      currentQuestionIndex,
      startedAtMillis: session.startedAtMillis,
      updatedAtMillis,
      config: session.config,
    });
  }, [activeIndex, session.config, session.startedAtMillis]);

  function persistLocal(nextAnswers = answersRef.current, nextMarked = markedRef.current) {
    window.localStorage.setItem(
      storageKey,
      makeDraftPayload(nextAnswers, nextMarked),
    );
  }

  function queueSave() {
    setStatus(online ? "Changes pending" : "Offline - saved on this device");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveNow(), 8000);
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
    const payload = makeDraftPayload();
    window.localStorage.setItem(storageKey, payload);
    if (!navigator.onLine) {
      setStatus("Offline - saved on this device");
      return;
    }
    const result = await saveDraftToServer(payload, activeIndex).catch(() => ({
      ok: false,
      error: "Save failed",
    }));
    setStatus(result.ok ? `Saved at ${new Date().toLocaleTimeString()}` : result.error || "Save failed - saved locally");
  }

  const saveDraftToServer = useCallback(async (payload: string, currentQuestionIndex: number) => {
    const response = await fetch(`/api/practice/tests/${session.test.id}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload,
        mode: session.config.mode,
        parts: session.config.parts,
        durationMinutes: session.config.durationMinutes,
        currentQuestionIndex,
      }),
    });
    const result = await response.json().catch(() => null);
    return {
      ok: response.ok && result?.success,
      error: result?.error as string | undefined,
    };
  }, [session.config.durationMinutes, session.config.mode, session.config.parts, session.test.id]);

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
    await saveDraftToServer(window.localStorage.getItem(storageKey) || "{}", activeIndex).catch(() => ({
      ok: false,
    }));
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

  useEffect(() => {
    const flush = () => {
      const payload = makeDraftPayload();
      window.localStorage.setItem(storageKey, payload);
      if (document.visibilityState === "hidden" && !submittingRef.current) {
        void saveDraftToServer(payload, activeIndex).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [activeIndex, makeDraftPayload, saveDraftToServer, storageKey]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      const payload = window.localStorage.getItem(storageKey);
      if (payload && !submittingRef.current) {
        void saveDraftToServer(payload, activeIndex).then(() => {
          setStatus(`Synced at ${new Date().toLocaleTimeString()}`);
        }).catch(() => setStatus("Save failed - saved locally"));
      }
    };
    const onOffline = () => {
      setOnline(false);
      setStatus("Offline - saved on this device");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [activeIndex, saveDraftToServer, storageKey]);

  return (
    <main className="exam-workspace design-system min-h-[calc(100dvh-4rem)] bg-white">
      <header className="exam-workspace-header sticky top-0 z-40 flex min-h-16 flex-wrap items-center justify-between gap-3 bg-[#1e3f68] px-4 py-3 text-white shadow">
        <button
          type="button"
          onClick={() => setConfirmExit(true)}
          className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20"
        >
          ← Thoát
        </button>
        <h1 className="min-w-0 flex-1 text-center text-lg font-extrabold">{title}</h1>
        <div className="flex items-center gap-2">
          <MobileNavigationMenu inverted />
          <div id="scratch-paper-launcher" className="inline-flex shrink-0 items-center" aria-label="Công cụ học tập" />
          <div id="question-annotation-launcher" className="inline-flex shrink-0 items-center" data-annotation-controls />
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

      <WorkspaceAnnotator uid={userUid} context={{ surface: "exam", resourceId: String(session.test.id), questionKey: String(activeQuestion?.id ?? "workspace") }} legacyContexts={activeQuestion ? [{ surface: "exam", resourceId: String(session.test.id), questionKey: String(activeQuestion.id) }] : []} disabled={confirmSubmit || confirmExit || submitting} className="grid grid-cols-1 gap-6 px-4 py-6 xl:grid-cols-[minmax(0,1fr)_320px]">
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

        <aside data-annotation-controls className="h-fit rounded-xl border border-line bg-surface p-5 shadow-sm xl:sticky xl:top-24">
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
                              ? "border-accent bg-accent text-gold-ink"
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
            <button type="button" onClick={() => setConfirmSubmit(true)} disabled={submitting} className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-gold-ink disabled:opacity-60">
              Submit
            </button>
          </div>
        </aside>
      </WorkspaceAnnotator>

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
    <div data-annotation-anchor={`question:${question.id}`}>
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
        <WorkspaceAnnotationAnchor target="passage"><div className="mt-4 rounded-lg bg-surface-soft p-4 text-sm leading-relaxed text-ink2 whitespace-pre-wrap">{question.group.passageText}</div></WorkspaceAnnotationAnchor>
      ) : null}
      {showQuestionText ? <WorkspaceAnnotationAnchor target={`question:${question.id}:prompt`}><p className="mt-4 whitespace-pre-wrap text-sm font-semibold text-ink">{question.content}</p></WorkspaceAnnotationAnchor> : null}
      {imageFirst && question.imageUrl ? <WorkspaceAnnotationAnchor target={`question:${question.id}:image`}><QuestionImage src={question.imageUrl} /></WorkspaceAnnotationAnchor> : null}
      {question.audioUrl ? <div data-annotation-anchor={`question:${question.id}:audio`} data-annotation-controls><audio controls src={question.audioUrl} className="mt-4 w-full" /></div> : null}
      {!imageFirst && question.imageUrl ? <WorkspaceAnnotationAnchor target={`question:${question.id}:image`}><QuestionImage src={question.imageUrl} /></WorkspaceAnnotationAnchor> : null}

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
                <WorkspaceAnnotationAnchor target={`question:${question.id}:option:${option.id}`} className="min-w-0 flex-1">
                  <span className={`text-sm text-ink ${showOptionText ? "" : "font-extrabold"}`}>{showOptionText ? option.content : optionLabel(option.content, optionIndex)}</span>
                </WorkspaceAnnotationAnchor>
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
        <button type="button" onClick={onNext} disabled={nextDisabled || disabled} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-gold-ink disabled:opacity-40">
          Câu tiếp
        </button>
      </footer>
    </article>
    </div>
  );
}

function QuestionImage({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt="Question media"
      width={1200}
      height={800}
      sizes="(max-width: 1024px) 100vw, 900px"
      className="mt-4 max-h-[520px] max-w-full rounded-lg border border-line object-contain"
    />
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
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(true, onCancel, dialogRef);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Hủy xác nhận" onClick={onCancel} />
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="practice-confirm-title" className="relative w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-2xl">
        <h2 id="practice-confirm-title" className="text-xl font-extrabold text-ink">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" data-dialog-initial-focus onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink">
            Quay lại
          </button>
          <button type="button" onClick={onConfirm} className="rounded-lg bg-accent px-4 py-2 text-sm font-extrabold text-gold-ink">
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
