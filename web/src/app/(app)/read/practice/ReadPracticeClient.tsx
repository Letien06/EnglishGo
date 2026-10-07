"use client";

import Image from "next/image";
import { decodeHTML } from "entities";
import Link from "@/components/IntentLink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { markVisited, routeKey } from "@/lib/nav/session-nav";
import { setActiveLearnerId } from "@/lib/client-learning-progress-cache";
import PracticeHeader from "../../_components/PracticeHeader";
import { usePracticeResume } from "@/lib/use-practice-resume";
import { useReadingProgressQueue } from "@/lib/reading-progress-queue";
import { parseReadingOptionTranslations } from "@/lib/reading-translations";
import { parseVocabularyEntries, vocabularyRowsText } from "@/lib/practice-vocabulary";
import type {
  DauToeicDifficultySession,
  DauToeicPracticeItem,
  DauToeicQuestion,
} from "@/types/dautoeic";

interface Props {
  session: DauToeicDifficultySession;
  partId: string;
  partNum: number;
  level: number;
  mode: string;
  userLoggedIn: boolean;
  initialIndex: number;
  userUid: string | null;
}

type PracticeMode = "normal" | "bilingual";
type MyVocabSet = { id: number; title: string };

const modes: Array<[PracticeMode, string, string]> = [
  ["normal", "▦", "Bình thường"],
  ["bilingual", "文", "Song ngữ"],
];

export default function ReadPracticeClient({
  session,
  partId,
  partNum,
  level,
  mode,
  userUid,
  userLoggedIn,
  initialIndex,
}: Props) {
  const initialMode = normalizeMode(mode);
  const [activeMode, setActiveMode] = useState<PracticeMode>(initialMode);
  const items = session.items;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [answeredMap, setAnsweredMap] = useState<Record<string, string>>({});
  const progressQueue = useReadingProgressQueue(userUid, userLoggedIn);
  const pendingAnswers = useMemo(() => {
    const answers: Record<string, string> = {};
    for (const action of progressQueue.pending) {
      if (action.part === partNum && action.level === level && action.testId === session.testId && items.some((entry) => entry.id === action.itemId && entry.questions.some((question) => question.id === action.questionId))) answers[action.questionId] = action.selectedAnswer;
    }
    return answers;
  }, [items, level, partNum, progressQueue.pending, session.testId]);
  const { markInteraction, resumeStatus } = usePracticeResume({ skill: "reading", uid: userUid, part: partNum, level, testId: session.testId, items, setAnswers: setAnsweredMap, setIndex: setCurrentIndex, pendingAnswers });
  const enqueueProgress = progressQueue.enqueue;
  const [showNote, setShowNote] = useState(false);
  const [auto, setAuto] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const [toolStatus, setToolStatus] = useState("");
  const startedAtRef = useRef(0);
  const autoAdvanceRef = useRef<number | null>(null);
  const item = items[currentIndex] ?? items[0];
  const firstQuestion = item.questions[0];
  const passageTranslation = cleanDisplayText(item.translation);
  const showPassageTranslation = activeMode === "bilingual" || Boolean(passageTranslation && item.questions.some((question) => answeredMap[question.id]));

  useEffect(() => {
    setActiveLearnerId(userUid);
  }, [userUid]);

  useEffect(() => {
    const pending = progressQueue.pending.filter((action) => action.part === partNum && action.level === level && action.testId === session.testId);
    if (!pending.length) return;
    // Restore answers from the external durable queue after client storage hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnsweredMap((previous) => {
      const restored = { ...previous };
      let changed = false;
      for (const action of [...pending].reverse()) {
        if (!restored[action.questionId] && items.some((entry) => entry.id === action.itemId && entry.questions.some((question) => question.id === action.questionId))) {
          restored[action.questionId] = action.selectedAnswer;
          changed = true;
        }
      }
      return changed ? restored : previous;
    });
  }, [items, level, partNum, progressQueue.pending, session.testId]);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("englishgo:overdelay-ready", {
          detail: { key: "practice-ready" },
        }));
      });
    });
    return () => {
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  const updatePracticeUrl = useCallback((next: { mode?: PracticeMode; q?: number }) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("part", partId);
    if (session.testId) {
      url.searchParams.set("testId", session.testId);
      url.searchParams.delete("level");
    } else {
      url.searchParams.set("level", String(level));
      url.searchParams.delete("testId");
    }
    url.searchParams.set("mode", next.mode ?? activeMode);
    url.searchParams.set("q", String(next.q ?? currentIndex));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [activeMode, currentIndex, level, partId, session.testId]);

  const switchMode = useCallback((nextMode: PracticeMode) => {
    if (nextMode === activeMode) return;
    setActiveMode(nextMode);
    updatePracticeUrl({ mode: nextMode });
  }, [activeMode, updatePracticeUrl]);


  useEffect(() => {
    startedAtRef.current = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Mark this practice route as visited so re-opening it later this session
  // (e.g. tapping "Luyện ngay" again) does not flash the loading overlay.
  useEffect(() => {
    markVisited(
      routeKey("/read/practice", {
        part: partId,
        level: session.testId ? undefined : String(level),
        testId: session.testId,
        mode: activeMode,
      }),
    );
  }, [activeMode, partId, level, session.testId]);

  useEffect(() => {
    updatePracticeUrl({ q: currentIndex });
  }, [currentIndex, updatePracticeUrl]);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= items.length) return;
    if (autoAdvanceRef.current !== null) {
      window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    setCurrentIndex(index);
    setShowNote(false);
    setFavorite(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [items.length]);

  const handleAnswer = useCallback((question: DauToeicQuestion, selected: string) => {
    if (answeredMap[question.id]) return;
    const selectedAnswer = normalizeAnswer(selected);
    const correctAnswer = normalizeAnswer(question.correctAnswer);
    const correct = selectedAnswer === correctAnswer;
    setAnsweredMap((prev) => ({ ...prev, [question.id]: selectedAnswer }));

    if (correct && auto && currentIndex < items.length - 1 && item.questions.every((entry) => entry.id === question.id || answeredMap[entry.id] === normalizeAnswer(entry.correctAnswer))) {
      if (autoAdvanceRef.current !== null) window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = window.setTimeout(() => {
        autoAdvanceRef.current = null;
        goTo(currentIndex + 1);
      }, 450);
    }

    enqueueProgress({
      part: partNum,
      level,
      testId: session.testId,
      itemId: item.id,
      questionId: question.id,
      selectedAnswer,
      correctAnswer,
      modeUsed: activeMode,
      assistPercent: 0,
      elapsedSeconds: elapsed,
    });


  }, [activeMode, answeredMap, auto, currentIndex, elapsed, enqueueProgress, goTo, item.id, item.questions, items.length, level, partNum, session.testId]);

  useEffect(() => () => {
    if (autoAdvanceRef.current !== null) window.clearTimeout(autoAdvanceRef.current);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(currentIndex - 1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(currentIndex + 1);
        return;
      }
      const answer = ({ "1": "A", "2": "B", "3": "C", "4": "D" } as Record<string, string>)[event.key];
      if (!answer) return;
      const unanswered = item.questions.find((question) => !answeredMap[question.id] && optionText(question, answer));
      if (unanswered) handleAnswer(unanswered, answer);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [answeredMap, currentIndex, goTo, handleAnswer, item.questions]);

  return (
    <main className="skill-workspace skill-workspace--read design-system min-h-dvh bg-surface" onPointerDownCapture={markInteraction} onKeyDownCapture={markInteraction}>
      <PracticeHeader skill="reading" partId={partId} part={partNum} level={level} testId={session.testId} testName={session.testName} setName={session.setName} grouped={session.grouping === "balanced"} modes={modes} activeMode={activeMode} onModeChange={(nextMode) => { if (nextMode === "normal" || nextMode === "bilingual") switchMode(nextMode); }} auto={auto} onToggleAuto={() => setAuto((value) => !value)} elapsed={formatElapsed(elapsed)} />
      {(progressQueue.pendingCount > 0 || progressQueue.error || resumeStatus) && <div className="practice-save-status flex flex-wrap items-center justify-between gap-2" role="status">
        <span>{progressQueue.pendingCount > 0 ? `${progressQueue.pendingCount} câu đang chờ lưu${progressQueue.isSaving ? " · Đang đồng bộ…" : ""}${progressQueue.error ? ` · ${progressQueue.error}` : ""}` : progressQueue.error || resumeStatus}</span>
        {(progressQueue.pendingCount > 0 || progressQueue.error) && <button type="button" onClick={progressQueue.retry} disabled={progressQueue.isSaving} className="rounded-lg border border-control-line bg-surface px-3 py-2 text-sm font-bold text-ink disabled:opacity-50">Thử lưu lại</button>}
      </div>}

      <div className={`practice-content grid min-h-[calc(100dvh-8rem)] lg:grid-cols-[1fr_1fr] ${partNum === 5 ? "practice-content--single" : ""}`}>
        <section className="practice-source-pane border-b border-line px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r lg:px-10 lg:py-6">
          <p className="mb-5 text-lg italic text-ink sm:text-xl">{readingInstruction(partNum)}</p>

          {item.imageUrl && (
            <Image
              src={item.imageUrl}
              alt="Reading material"
              width={1200}
              height={800}
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="mb-4 max-h-[48dvh] w-full object-contain"
            />
          )}

          {partNum !== 5 && item.transcript ? (
            <article className="practice-passage rounded-2xl border border-line bg-paper p-6">
              <h2 className="mb-4 text-xl font-extrabold text-ink">
                Passage
              </h2>
              <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-ink">{cleanDisplayText(item.transcript)}</pre>
              {showPassageTranslation && (
                <section aria-label="Bản dịch đoạn đọc" className="mt-5 border-t border-line pt-5">
                  <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-teal-ink">Tiếng Việt</h3>
                  {passageTranslation ? (
                    <pre lang="vi" className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink2">{passageTranslation}</pre>
                  ) : activeMode === "bilingual" ? (
                    <p className="text-sm text-muted">Đoạn đọc này chưa có bản dịch tiếng Việt.</p>
                  ) : null}
                </section>
              )}
            </article>
          ) : (
            <article className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="mb-4 text-xl font-extrabold text-ink">Đoạn đọc</h2>
              <p className="text-sm text-muted">Part 5 hiển thị câu cần hoàn thành ở từng câu hỏi.</p>
            </article>
          )}
        </section>

        <section className="practice-question-pane px-4 py-5 sm:px-6 lg:px-10 lg:py-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="practice-question-count rounded-full border border-info-line bg-info-soft px-4 py-1 text-sm font-extrabold text-info-ink">
              #{currentIndex + 1}/{items.length}
            </span>
            <button
              type="button"
              onClick={async () => {
                if (!firstQuestion) return;
                setFavorite((value) => !value);
                await postTool("/api/reading/favorites", {
                  part: partNum,
                  level,
                  itemId: item.id,
                  questionId: firstQuestion.id,
                });
              }}
              className={`rounded-xl border px-4 py-3 ${favorite ? "border-warning-line bg-warning-soft text-primary-ink" : "border-line text-primary-ink"}`}
              aria-label="Yêu thích"
            >
              {favorite ? "★" : "☆"}
            </button>
          </div>
          <h2 className="mb-5 text-3xl font-extrabold text-ink">{partNum === 5 ? "Question" : "Nhóm câu hỏi"}</h2>

          <div className="practice-question-card rounded-2xl border border-line bg-surface p-5">
            {item.questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                item={item}
                question={question}
                index={index}
                partNum={partNum}
                mode={activeMode}
                answered={answeredMap[question.id] ?? null}
                onAnswer={(selected) => handleAnswer(question, selected)}
              />
            ))}
          </div>

          {showNote && firstQuestion && (
            <ToolBox
              title="Ghi chú"
              textareaName="note"
              placeholder="Viết ghi chú của bạn..."
              status={toolStatus}
              onSubmit={async (form) => {
                const payload = await postTool("/api/reading/notes", {
                  itemId: item.id,
                  questionId: firstQuestion.id,
                  note: String(form.get("note") ?? ""),
                });
                setToolStatus(payload?.data?.message ?? "Đã xử lý.");
              }}
            />
          )}
        </section>
      </div>

      <footer className="skill-workspace-footer sticky bottom-0 z-40 flex h-16 items-center justify-between gap-2 px-3 sm:px-7">
        <div className="flex gap-2 sm:gap-3">
          <button aria-label="Ghi chú" onClick={() => setShowNote((value) => !value)} className="rounded-xl bg-surface px-3 py-2 text-sm font-extrabold text-primary-ink sm:px-5">
            ✎<span className="hidden sm:inline"> Ghi chú</span>
          </button>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button aria-label="Bài trước" onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0} className="rounded-xl px-4 py-3 font-extrabold disabled:opacity-40 sm:px-5">‹</button>
          <span className="px-4 py-3 text-sm font-bold tabular-nums sm:px-5">{currentIndex + 1}/{items.length}</span>
          <button aria-label="Bài tiếp" onClick={() => goTo(currentIndex + 1)} disabled={currentIndex >= items.length - 1} className="rounded-xl px-4 py-3 font-extrabold disabled:opacity-40 sm:px-5">›</button>
        </div>
      </footer>
    </main>
  );
}

function QuestionCard({
  item,
  question,
  index,
  partNum,
  mode,
  answered,
  onAnswer,
}: {
  item: DauToeicPracticeItem;
  question: DauToeicQuestion;
  index: number;
  partNum: number;
  mode: PracticeMode;
  answered: string | null;
  onAnswer: (selected: string) => void;
}) {
  const { options, translations } = useMemo(() => {
    const options = questionOptions(question);
    return { options, translations: parseReadingOptionTranslations(cleanDisplayText(question.answerTranslationVi), options) };
  }, [question]);
  const sourceTranslation = cleanDisplayText(question.translationVi);
  const passageTranslation = cleanDisplayText(item.translation);
  const sentenceTranslation = partNum === 5
    ? sourceTranslation || (item.questions.length === 1 ? passageTranslation : "")
    : sourceTranslation !== passageTranslation ? sourceTranslation : "";
  const correctAnswer = normalizeAnswer(question.correctAnswer);
  const correct = answered != null && answered === correctAnswer;
  const questionText = normalizeQuestionText(question.questionText, index + 1);

  return (
    <article className="mb-8 last:mb-0">
      <h3 className="mb-4 text-xl font-extrabold text-ink">
        {questionText}
      </h3>
      {partNum === 5 && item.transcript && cleanDisplayText(item.transcript) !== questionText && (
        <p className="mb-4 rounded-xl bg-surface-soft p-4 text-sm font-bold leading-relaxed text-ink">{cleanDisplayText(item.transcript)}</p>
      )}

      {mode === "bilingual" && (sentenceTranslation || partNum === 5) && (
        <section aria-label="Bản dịch câu hỏi" className="mb-4 rounded-xl border border-teal-line bg-teal-soft p-4">
          <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-teal-ink">Tiếng Việt</h4>
          {sentenceTranslation ? (
            <p lang="vi" className="whitespace-pre-wrap text-base leading-relaxed text-ink">{sentenceTranslation}</p>
          ) : (
            <p className="text-sm text-muted">Câu này chưa có bản dịch tiếng Việt.</p>
          )}
        </section>
      )}

      <div className="space-y-3">
        {options.map((option) => {
          return (
            <AnswerOption
              key={option.key}
              optionKey={option.key}
              text={option.text}
              translation={translations[option.key]}
              correctAnswer={correctAnswer}
              selected={answered}
              mode={mode}
              onAnswer={() => onAnswer(option.key)}
            />
          );
        })}
      </div>

      {answered && (
        <small className={`mt-4 block text-sm font-extrabold ${correct ? "text-success-ink" : "text-danger-ink"}`} aria-live="polite">
          {correct ? "Đúng" : `Chưa đúng. Đáp án đúng: ${correctAnswer}`}
        </small>
      )}

      {answered && (
        <section className="mt-5 space-y-4 text-sm text-ink">
          <ResultCard
            correct={correct}
            value={correct ? `Bạn chọn ${answered}. Đáp án đúng.` : `Bạn chọn ${answered}. Đáp án đúng là ${correctAnswer}.`}
          />
          {firstText(question.explanationVi, question.explanationEn) && (
            <SolutionBlock
              title="Giải thích"
              value={firstText(question.explanationVi, question.explanationEn)}
              tone="blue"
            />
          )}
          {mode !== "bilingual" && sentenceTranslation && (
            <SolutionBlock
              title="Dịch nghĩa câu hỏi"
              value={sentenceTranslation}
              tone="sky"
            />
          )}
          {question.answerTranslationVi && (
            <SolutionBlock
              title="Dịch nghĩa đáp án"
              value={question.answerTranslationVi}
              tone="sky"
            />
          )}
          {firstText(question.vocabulary, item.vocabulary) && (
            <VocabularyStudyBlock
              item={item}
              question={question}
              value={firstText(question.vocabulary, item.vocabulary)}
            />
          )}
        </section>
      )}
    </article>
  );
}

function AnswerOption({
  optionKey: answerKey,
  text,
  translation,
  correctAnswer,
  selected,
  mode,
  onAnswer,
}: {
  optionKey: string;
  text: string;
  translation?: string;
  correctAnswer: string;
  selected: string | null;
  mode: PracticeMode;
  onAnswer: () => void;
}) {
  const isSelected = selected === answerKey;
  const isCorrectChoice = selected != null && correctAnswer === answerKey;
  const isWrongChoice = isSelected && selected !== correctAnswer;
  const stateClass = isCorrectChoice
    ? "border-success-line bg-success-soft text-success-ink"
    : isWrongChoice
      ? "border-danger-line bg-danger-soft text-danger-ink"
      : "border-control-line bg-surface text-ink hover:border-primary";

  return (
    <div
      role="radio"
      data-answer-state={isCorrectChoice ? "correct" : isWrongChoice ? "wrong" : "idle"}
      aria-checked={isSelected}
      tabIndex={0}
      onClick={() => {
        if (!selected) onAnswer();
      }}
      onKeyDown={(event) => {
        if (!selected && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onAnswer();
        }
      }}
      className={`practice-answer flex w-full cursor-pointer items-start gap-4 rounded-xl border px-5 py-3 text-left text-base font-semibold transition-colors ${stateClass}`}
    >
      <input type="radio" checked={isSelected} readOnly tabIndex={-1} className="mt-1" aria-label={`Đáp án ${answerKey}`} />
      <span className="min-w-10">({answerKey})</span>
      <span className="min-w-0 flex-1">
        {mode === "normal" && <span>{text}</span>}
        {mode === "bilingual" && (
          <>
            <span>{text}</span>
            {translation && <span lang="vi" className="mt-2 block text-sm font-bold text-ink">{translation}</span>}
          </>
        )}
      </span>
    </div>
  );
}

function ToolBox({
  title,
  placeholder,
  textareaName,
  status,
  onSubmit,
  secondaryInput = false,
}: {
  title: string;
  placeholder: string;
  textareaName: string;
  status: string;
  onSubmit: (form: FormData) => Promise<void>;
  secondaryInput?: boolean;
}) {
  return (
    <form
      className="mt-4 rounded-xl border border-line bg-surface p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(new FormData(event.currentTarget));
      }}
    >
      <h3 className="font-extrabold text-ink">{title}</h3>
      <textarea name={textareaName} className="mt-3 w-full rounded-lg border border-line p-3 text-sm" rows={3} placeholder={placeholder} />
      {secondaryInput && <input name="meaning" className="mt-3 w-full rounded-lg border border-line p-3 text-sm" placeholder="Nghĩa" autoComplete="off" />}
      <button className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-extrabold text-gold-ink" type="submit">Lưu</button>
      {status && <small className="ml-3 text-sm font-bold text-muted">{status}</small>}
    </form>
  );
}

function ResultCard({ correct, value }: { correct: boolean; value: string }) {
  return (
    <section
      className={`rounded-2xl border p-4 ${
        correct ? "border-success-line bg-success-soft text-success-ink" : "border-danger-line bg-danger-soft text-danger-ink"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-base font-extrabold">
          {correct ? "✓" : "!"}
        </span>
        <div>
          <strong className="block text-base">Kết quả</strong>
          <p className="mt-1 font-bold">{value}</p>
        </div>
      </div>
    </section>
  );
}

function SolutionBlock({ title, value, tone }: { title: string; value: string; tone: "blue" | "sky" }) {
  const toneClass = tone === "sky"
    ? "border-teal-line bg-teal-soft text-teal-ink"
    : "border-info-line bg-info-soft text-info-ink";
  const iconClass = tone === "sky" ? "bg-teal-soft text-teal-ink" : "bg-info-soft text-info-ink";

  return (
    <section className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="mb-3 flex items-center gap-3">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold ${iconClass}`}>
          文
        </span>
        <strong className="text-base">{title}</strong>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed">{value}</p>
    </section>
  );
}

function VocabularyStudyBlock({
  value,
}: {
  item: DauToeicPracticeItem;
  question: DauToeicQuestion;
  value: string;
}) {
  const entries = useMemo(() => parseVocabularyEntries(value), [value]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [status, setStatus] = useState("");
  const [sets, setSets] = useState<MyVocabSet[]>([]);
  const [setId, setSetId] = useState<string>("");
  const [loadingSets, setLoadingSets] = useState(true);

  useEffect(() => {
    if (entries.length === 0) return;
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/vocab/my-sets");
        const payload = await response.json();
        const list: MyVocabSet[] = Array.isArray(payload?.data) ? payload.data : [];
        if (!active) return;
        setSets(list);
        if (list.length > 0) setSetId(String(list[0].id));
      } catch {
        if (active) setSets([]);
      } finally {
        if (active) setLoadingSets(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [entries.length]);

  const allSelected = entries.length > 0 && selected.size === entries.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(entries.map((entry) => entry.id)));
  };

  const toggleEntry = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addSelected = async () => {
    const targets = entries.filter((entry) => selected.has(entry.id));
    if (targets.length === 0 || !setId) return;
    setSaving(true);
    setStatus("");
    try {
      const rowsText = vocabularyRowsText(targets);
      const payload = await postTool(`/api/vocab/my-sets/${setId}`, {
        action: "manual",
        rowsText,
      });
      const count = payload?.data?.count;
      const setName = sets.find((set) => String(set.id) === setId)?.title ?? "bộ từ";
      setStatus(`Đã thêm ${typeof count === "number" ? count : targets.length} từ vào "${setName}".`);
      setSelected(new Set());
    } catch {
      setStatus("Không thêm được từ vựng.");
    } finally {
      setSaving(false);
    }
  };

  if (entries.length === 0) {
    return (
      <section aria-label="Từ vựng nên học" className="rounded-2xl border border-warning-line bg-warning-soft p-4 text-warning-ink">
        <strong className="text-base">Từ vựng nên học</strong>
        <p className="mt-2 text-sm">Chưa có từ vựng hợp lệ cho câu này.</p>
      </section>
    );
  }

  return (
    <section aria-label="Từ vựng nên học" className="overflow-hidden rounded-2xl border border-warning-line bg-warning-soft text-warning-ink">
      <div className="flex items-center justify-between gap-3 border-b border-warning-line px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-warning-soft text-sm font-extrabold text-warning-ink">
            □
          </span>
          <strong className="text-base">Từ vựng nên học</strong>
        </div>
        <button
          type="button"
          onClick={() => setShowDetails((open) => !open)}
          className="rounded-full border border-warning-line bg-surface px-3 py-1 text-xs font-extrabold text-warning-ink"
        >
          {showDetails ? "Ẩn chi tiết" : "Xem chi tiết"}
        </button>
      </div>

      <div className="m-3 overflow-hidden rounded-xl border border-warning-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-warning-line p-3">
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-xl border border-warning-line bg-surface px-4 py-2 text-sm font-extrabold text-warning-ink"
          >
            {allSelected ? "Bỏ chọn" : "Chọn tất cả"}
          </button>
          {loadingSets ? (
            <span className="text-sm font-bold text-warning-ink">Đang tải bộ từ...</span>
          ) : sets.length === 0 ? (
            <Link
              href="/vocab"
              className="rounded-xl border border-warning-line bg-surface px-4 py-2 text-sm font-extrabold text-warning-ink"
            >
              Tạo bộ từ của tôi
            </Link>
          ) : (
            <>
              <select
                value={setId}
                onChange={(event) => setSetId(event.target.value)}
                className="rounded-xl border border-warning-line bg-surface px-3 py-2 text-sm font-extrabold text-warning-ink"
                aria-label="Chọn bộ từ của tôi"
              >
                {sets.map((set) => (
                  <option key={set.id} value={String(set.id)}>
                    {set.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addSelected}
                disabled={selected.size === 0 || saving || !setId}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-extrabold text-gold-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Đang thêm..." : "Thêm vào bộ từ của tôi"}
              </button>
            </>
          )}
          {status && <span className="text-sm font-bold text-warning-ink">{status}</span>}
        </div>

        <div className="divide-y divide-line">
          {entries.map((entry) => (
            <label key={entry.id} className="flex cursor-pointer items-start gap-3 px-4 py-4">
              <input
                type="checkbox"
                aria-label={`Chọn từ ${entry.word}`}
                checked={selected.has(entry.id)}
                onChange={() => toggleEntry(entry.id)}
                className="mt-1 h-5 w-5 rounded border-warning-line"
              />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-base text-ink">{entry.word}</strong>
                  {entry.partOfSpeech && <em className="text-sm text-warning-ink">({entry.partOfSpeech})</em>}
                  {entry.level && <span className="rounded-md bg-teal-soft px-2 py-0.5 text-xs font-extrabold text-teal-ink">{entry.level}</span>}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-ink">{entry.meaning}</span>
                {showDetails && entry.raw !== `${entry.word} ${entry.meaning}` && (
                  <span className="mt-2 block whitespace-pre-wrap text-xs text-muted">{entry.raw}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function questionOptions(question: DauToeicQuestion): Array<{ key: string; text: string }> {
  return [
    { key: "A", text: question.optionA },
    { key: "B", text: question.optionB },
    { key: "C", text: question.optionC },
    { key: "D", text: question.optionD },
  ]
    .filter((option): option is { key: string; text: string } => Boolean(cleanDisplayText(option.text)))
    .map((option) => ({ ...option, text: cleanDisplayText(option.text) }));
}


async function postTool(url: string, body: Record<string, unknown>) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await response.json();
  } catch {
    return { data: { saved: false, message: "Không lưu được." } };
  }
}

function optionText(question: DauToeicQuestion, answer: string) {
  return answer === "A" ? question.optionA : answer === "B" ? question.optionB : answer === "C" ? question.optionC : question.optionD;
}

function normalizeQuestionText(value: string | null | undefined, index: number): string {
  const cleaned = removeScriptBlock(cleanDisplayText(value));
  return cleaned || `Question ${index}`;
}

function removeScriptBlock(value: string): string {
  const text = value.trim();
  if (!text) return "";
  const scriptIndex = text.search(/\bSCRIPT\s*:/i);
  if (scriptIndex < 0) return text;
  const afterQuestionMarker = text
    .slice(scriptIndex)
    .match(/\b(?:QUESTION|QUESTIONS)\s*:?\s*([\s\S]+)/i);
  if (afterQuestionMarker?.[1]?.trim()) return afterQuestionMarker[1].trim();
  return text.slice(0, scriptIndex).trim();
}

function cleanDisplayText(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return decodeHtmlEntities(
    value
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/(?:p|div|h[1-6]|li|tr|blockquote)\s*>/gi, "\n")
      .replace(/<\s*\/(?:td|th)\s*>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s*[|｜]\s*$/, "")
      .trim(),
  );
}

function decodeHtmlEntities(value: string): string {
  return decodeHTML(value);
}

function readingInstruction(partNum: number) {
  if (partNum === 5) return "Choose the best word or phrase to complete the sentence.";
  if (partNum === 6) return "Choose the best option to complete the text.";
  return "Read the passage and choose the best answer.";
}


function firstText(...values: Array<string | null | undefined>) {
  const value = values.find((candidate) => candidate && String(candidate).trim().length > 0);
  return value == null ? "" : String(value).trim();
}

function normalizeAnswer(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function normalizeMode(value: string): PracticeMode {
  return value === "bilingual" ? value : "normal";
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
