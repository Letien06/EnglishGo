"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { markVisited, routeKey } from "@/lib/nav/session-nav";
import PracticeMobileMenu from "../../_components/PracticeMobileMenu";
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
}

type PracticeMode = "normal" | "bilingual";
type VocabularyEntry = {
  id: string;
  word: string;
  meaning: string;
  partOfSpeech: string | undefined;
  level: string | undefined;
  raw: string;
};
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
}: Props) {
  const initialMode = normalizeMode(mode);
  const [activeMode, setActiveMode] = useState<PracticeMode>(initialMode);
  const items = session.items;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answeredMap, setAnsweredMap] = useState<Record<string, string>>({});
  const [showNote, setShowNote] = useState(false);
  const [auto, setAuto] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const [toolStatus, setToolStatus] = useState("");
  const startedAtRef = useRef(0);
  const item = items[currentIndex] ?? items[0];
  const firstQuestion = item.questions[0];

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
    url.searchParams.set("level", String(level));
    url.searchParams.set("mode", next.mode ?? activeMode);
    url.searchParams.set("q", String(next.q ?? currentIndex));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [activeMode, currentIndex, level, partId]);

  const switchMode = useCallback((nextMode: PracticeMode) => {
    if (nextMode === activeMode) return;
    setActiveMode(nextMode);
    updatePracticeUrl({ mode: nextMode });
  }, [activeMode, updatePracticeUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => setCurrentIndex(initialItemIndex(items.length)), 0);
    return () => window.clearTimeout(timer);
  }, [items.length]);

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
        level: String(level),
        mode: activeMode,
      }),
    );
  }, [activeMode, partId, level]);

  useEffect(() => {
    updatePracticeUrl({ q: currentIndex });
  }, [currentIndex, updatePracticeUrl]);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= items.length) return;
    setCurrentIndex(index);
    setShowNote(false);
    setFavorite(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [items.length]);

  const handleAnswer = useCallback(async (question: DauToeicQuestion, selected: string) => {
    if (answeredMap[question.id]) return;
    const selectedAnswer = normalizeAnswer(selected);
    const correctAnswer = normalizeAnswer(question.correctAnswer);
    const correct = selectedAnswer === correctAnswer;
    setAnsweredMap((prev) => ({ ...prev, [question.id]: selectedAnswer }));

    try {
      await fetch("/api/reading/progress", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part: partNum,
          level,
          itemId: item.id,
          questionId: question.id,
          selectedAnswer,
          correctAnswer,
          modeUsed: activeMode,
          assistPercent: 0,
          elapsedSeconds: elapsed,
        }),
      });
    } catch {
      // Progress saving is best-effort, matching the old Spring client.
    }

    if (correct && auto && currentIndex < items.length - 1) {
      window.setTimeout(() => goTo(currentIndex + 1), 450);
    }
  }, [activeMode, answeredMap, auto, currentIndex, elapsed, goTo, item.id, items.length, level, partNum]);

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
    <main className="min-h-dvh bg-white">
      <header className="sticky top-0 z-40 flex h-16 items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-800 px-3 text-white shadow-md sm:gap-4 sm:px-7">
        <Link
          href={`/read?part=${partId}`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/10 text-xl font-bold"
          aria-label="Thoát"
        >
          ←
        </Link>
        <span className="hidden h-11 w-11 items-center justify-center rounded-full bg-primary text-xl font-extrabold text-gold-ink sm:inline-flex">
          文
        </span>
        <h1 className="min-w-0 flex-1 truncate text-base font-extrabold sm:text-xl">
          Part {partNum} · Cấp {level} · Đọc
        </h1>

        <nav className="hidden flex-1 items-center justify-center rounded-xl border border-white/25 bg-white/10 p-1 lg:flex">
          {modes.map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchMode(key)}
              className={`inline-flex min-w-36 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-extrabold ${
                activeMode === key ? "bg-white/20 ring-2 ring-white/35" : "hover:bg-white/10"
              }`}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setAuto((value) => !value)}
          className={`hidden rounded-xl border border-white/30 px-4 py-2 text-sm font-extrabold lg:block ${
            auto ? "bg-white text-blue-700" : "bg-white/10 text-white"
          }`}
          title="Tự chuyển bài khi trả lời đúng"
        >
          Auto
        </button>
        <span className="hidden min-w-14 text-center text-sm font-extrabold tabular-nums lg:inline">{formatElapsed(elapsed)}</span>
        <PracticeMobileMenu
          modes={modes}
          activeMode={activeMode}
          auto={auto}
          onToggleAuto={() => setAuto((value) => !value)}
          onModeChange={(nextMode) => {
            if (nextMode === "normal" || nextMode === "bilingual") {
              switchMode(nextMode);
            }
          }}
          assist={0}
          assistOptions={[]}
          elapsed={formatElapsed(elapsed)}
          modeHref={(m) => `/read/practice?part=${partId}&level=${level}&mode=${m}&q=${currentIndex}`}
          assistHref={() => `/read/practice?part=${partId}&level=${level}&mode=${activeMode}&q=${currentIndex}`}
        />
      </header>

      <div className="grid min-h-[calc(100dvh-8rem)] lg:grid-cols-[1fr_1fr]">
        <section className="border-b border-slate-200 px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r lg:px-10 lg:py-6">
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
            <article className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-xl font-extrabold text-ink">
                Passage
              </h2>
              <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-ink">{cleanDisplayText(item.transcript)}</pre>
              {activeMode === "bilingual" && item.translation && (
                <pre className="mt-5 whitespace-pre-wrap border-t border-slate-200 pt-5 font-sans text-sm leading-relaxed text-muted">
                  {cleanDisplayText(item.translation)}
                </pre>
              )}
            </article>
          ) : (
            <article className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-xl font-extrabold text-ink">Đoạn đọc</h2>
              <p className="text-sm text-muted">Part 5 hiển thị câu cần hoàn thành ở từng câu hỏi.</p>
            </article>
          )}
        </section>

        <section className="px-4 py-5 sm:px-6 lg:px-10 lg:py-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-4 py-1 text-sm font-extrabold text-ink">
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
              className={`rounded-xl border px-4 py-3 ${favorite ? "border-amber-300 bg-amber-50 text-primary" : "border-slate-200 text-primary"}`}
              aria-label="Yêu thích"
            >
              {favorite ? "★" : "☆"}
            </button>
          </div>
          <h2 className="mb-5 text-3xl font-extrabold text-ink">{partNum === 5 ? "Question" : "Nhóm câu hỏi"}</h2>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
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

      <footer className="sticky bottom-0 z-40 flex h-16 items-center justify-between gap-2 bg-gradient-to-r from-cyan-500 to-blue-800 px-3 text-white sm:px-7">
        <div className="flex gap-2 sm:gap-3">
          <button onClick={() => setShowNote((value) => !value)} className="rounded-xl bg-white px-3 py-2 text-sm font-extrabold text-primary sm:px-5">
            ✎<span className="hidden sm:inline"> Ghi chú</span>
          </button>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0} className="rounded-xl bg-blue-600 px-4 py-3 font-extrabold disabled:opacity-40 sm:px-5">‹</button>
          <span className="rounded-xl bg-green-500 px-4 py-3 font-extrabold sm:px-5">{currentIndex + 1}/{items.length}</span>
          <button onClick={() => goTo(currentIndex + 1)} disabled={currentIndex >= items.length - 1} className="rounded-xl bg-blue-600 px-4 py-3 font-extrabold disabled:opacity-40 sm:px-5">›</button>
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
  const translations = useMemo(
    () => parseOptionTranslations(cleanDisplayText(firstText(question.answerTranslationVi, question.translationVi))),
    [question.answerTranslationVi, question.translationVi],
  );
  const options = questionOptions(question);
  const correctAnswer = normalizeAnswer(question.correctAnswer);
  const correct = answered != null && answered === correctAnswer;
  const questionText = normalizeQuestionText(question.questionText, index + 1);

  return (
    <article className="mb-8 last:mb-0">
      <h3 className="mb-4 text-xl font-extrabold text-ink">
        {questionText}
      </h3>
      {partNum === 5 && item.transcript && (
        <p className="mb-4 rounded-xl bg-slate-50 p-4 text-sm font-bold leading-relaxed text-ink">{cleanDisplayText(item.transcript)}</p>
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
        <small className={`mt-4 block text-sm font-extrabold ${correct ? "text-emerald-600" : "text-red-600"}`} aria-live="polite">
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
          {firstText(question.translationVi, item.translation, question.answerTranslationVi) && (
            <SolutionBlock
              title="Dịch nghĩa câu hỏi"
              value={[firstText(question.translationVi, item.translation), firstText(question.answerTranslationVi)].filter(Boolean).join("\n\n")}
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
    ? "border-green-400 bg-green-50 text-green-700"
    : isWrongChoice
      ? "border-red-400 bg-red-50 text-red-700"
      : "border-slate-300 bg-white text-ink hover:border-primary";

  return (
    <div
      role="radio"
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
      className={`flex w-full cursor-pointer items-start gap-4 rounded-xl border px-5 py-3 text-left text-base font-extrabold transition-colors ${stateClass}`}
    >
      <input type="radio" checked={isSelected} readOnly tabIndex={-1} className="mt-1" aria-label={`Đáp án ${answerKey}`} />
      <span className="min-w-10">({answerKey})</span>
      <span className="min-w-0 flex-1">
        {mode === "normal" && <span>{text}</span>}
        {mode === "bilingual" && (
          <>
            <span>{text}</span>
            {translation && <span className="mt-2 block text-sm font-bold text-ink">{translation}</span>}
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
      className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(new FormData(event.currentTarget));
      }}
    >
      <h3 className="font-extrabold text-ink">{title}</h3>
      <textarea name={textareaName} className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm" rows={3} placeholder={placeholder} />
      {secondaryInput && <input name="meaning" className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm" placeholder="Nghĩa" autoComplete="off" />}
      <button className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-extrabold text-gold-ink" type="submit">Lưu</button>
      {status && <small className="ml-3 text-sm font-bold text-muted">{status}</small>}
    </form>
  );
}

function ResultCard({ correct, value }: { correct: boolean; value: string }) {
  return (
    <section
      className={`rounded-2xl border p-4 ${
        correct ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-base font-extrabold">
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
    ? "border-sky-300 bg-sky-50 text-sky-900"
    : "border-blue-300 bg-blue-50 text-blue-900";
  const iconClass = tone === "sky" ? "bg-sky-100 text-sky-700" : "bg-blue-100 text-blue-700";

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
  }, []);

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
      const rowsText = targets
        .map((entry) => `${entry.word}, ${entry.meaning.replace(/[\r\n]+/g, " ").trim()}`)
        .join("\n");
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

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 text-amber-950">
      <div className="flex items-center justify-between gap-3 border-b border-amber-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-sm font-extrabold text-amber-700">
            □
          </span>
          <strong className="text-base">Từ vựng nên học</strong>
        </div>
        <button
          type="button"
          onClick={() => setShowDetails((open) => !open)}
          className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-extrabold text-amber-800"
        >
          {showDetails ? "Ẩn chi tiết" : "Xem chi tiết"}
        </button>
      </div>

      <div className="m-3 overflow-hidden rounded-xl border border-amber-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 p-3">
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-extrabold text-amber-800"
          >
            {allSelected ? "Bỏ chọn" : "Chọn tất cả"}
          </button>
          {loadingSets ? (
            <span className="text-sm font-bold text-amber-700">Đang tải bộ từ...</span>
          ) : sets.length === 0 ? (
            <Link
              href="/vocab"
              className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-extrabold text-amber-800"
            >
              Tạo bộ từ của tôi
            </Link>
          ) : (
            <>
              <select
                value={setId}
                onChange={(event) => setSetId(event.target.value)}
                className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-extrabold text-amber-800"
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
                className="rounded-xl bg-orange-400 px-4 py-2 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Đang thêm..." : "Thêm vào bộ từ của tôi"}
              </button>
            </>
          )}
          {status && <span className="text-sm font-bold text-amber-800">{status}</span>}
        </div>

        <div className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <label key={entry.id} className="flex cursor-pointer items-start gap-3 px-4 py-4">
              <input
                type="checkbox"
                checked={selected.has(entry.id)}
                onChange={() => toggleEntry(entry.id)}
                className="mt-1 h-5 w-5 rounded border-amber-300"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-base text-ink">{entry.word}</strong>
                  {entry.partOfSpeech && <em className="text-sm text-orange-700">({entry.partOfSpeech})</em>}
                  {entry.level && <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-extrabold text-sky-700">{entry.level}</span>}
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

function initialItemIndex(total: number) {
  const raw = Number.parseInt(new URLSearchParams(window.location.search).get("q") ?? "0", 10);
  if (Number.isNaN(raw)) return 0;
  return Math.max(0, Math.min(Math.max(total - 1, 0), raw));
}

function parseOptionTranslations(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text) return result;
  text
    .replace(/\r/g, "\n")
    .split(/\n+|(?=\([A-D]\))/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const match = part.match(/^\(?([A-D])\)?[\s.:-]*(.+)$/i);
      if (match) result[match[1].toUpperCase()] = match[2].trim();
    });
  return result;
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
      .replace(/<\s*\/p\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function readingInstruction(partNum: number) {
  if (partNum === 5) return "Choose the best word or phrase to complete the sentence.";
  if (partNum === 6) return "Choose the best option to complete the text.";
  return "Read the passage and choose the best answer.";
}


function parseVocabularyEntries(value: string): VocabularyEntry[] {
  const parts = value
    .replace(/\r/g, "\n")
    .split(/\n+|;+/g)
    .map((part) => part.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);

  const source = parts.length > 0 ? parts : [value.trim()].filter(Boolean);

  return source.map((raw, index) => {
    const colonMatch = raw.match(/^(.+?)(?:\s*[:：–-]\s+)(.+)$/);
    const compactMatch = raw.match(/^([A-Za-z][A-Za-z'’\-\s]*?)(?:\s*\(([^)]+)\))?\s+(.+)$/);
    const match = colonMatch || compactMatch;
    const word = firstText(match?.[1], raw.split(/\s+/)[0]);
    const partOfSpeech = colonMatch ? undefined : firstText(match?.[2]);
    let meaning = firstText(colonMatch ? match?.[2] : match?.[3], raw.replace(word, ""));
    let level: string | undefined;

    const levelMatch = meaning.match(/^(A1|A2|B1|B2|C1|C2)\s+(.+)$/i);
    if (levelMatch) {
      level = levelMatch[1].toUpperCase();
      meaning = levelMatch[2].trim();
    }

    return {
      id: `${word.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`,
      word,
      meaning: meaning || raw,
      partOfSpeech,
      level,
      raw,
    };
  });
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
