"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  assist: number;
  userLoggedIn: boolean;
  savedAnswers?: Record<string, string>;
}

type PracticeMode = "normal" | "bilingual" | "fill" | "flip";
type Token = { type: "word" | "space" | "punct"; value: string };

const modes: Array<[PracticeMode, string, string]> = [
  ["normal", "▦", "Bình thường"],
  ["bilingual", "文", "Song ngữ"],
  ["fill", "✍", "Điền từ"],
  ["flip", "⇄", "Lật từ"],
];

const assistOptions = [30, 50, 100];

export default function ListenPracticeClient({
  session,
  partId,
  partNum,
  level,
  mode,
  assist,
  savedAnswers,
}: Props) {
  const activeMode = normalizeMode(mode);
  const items = session.items;
  const initialAnswers = useMemo(
    () => normalizeSavedAnswers(savedAnswers),
    [savedAnswers],
  );
  const [currentIndex, setCurrentIndex] = useState(() =>
    initialItemIndex(items, initialAnswers),
  );
  const [answeredMap, setAnsweredMap] = useState<Record<string, string>>(initialAnswers);
  const [revealedMap, setRevealedMap] = useState<Record<string, number[]>>({});
  const [fillValues, setFillValues] = useState<Record<string, string>>({});
  const [showNote, setShowNote] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [auto, setAuto] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [favorite, setFavorite] = useState(false);
  const [toolStatus, setToolStatus] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const replayCountRef = useRef(0);
  const startedAtRef = useRef(0);
  const item = items[currentIndex] ?? items[0];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCurrentIndex(initialItemIndex(items, initialAnswers));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [items, initialAnswers]);

  useEffect(() => {
    startedAtRef.current = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("q", String(currentIndex));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [currentIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.ctrlKey && audioRef.current) {
        event.preventDefault();
        if (audioRef.current.paused) {
          audioRef.current.play().catch(() => undefined);
        } else {
          audioRef.current.pause();
        }
        return;
      }
      if (event.shiftKey && audioRef.current) {
        event.preventDefault();
        rewindAudio(audioRef.current, 3);
        replayCountRef.current += 1;
        return;
      }
      if (event.key === "Tab" && (activeMode === "fill" || activeMode === "flip")) {
        const firstQuestion = item.questions[0];
        if (!firstQuestion) return;
        event.preventDefault();
        revealNextWords(firstQuestion, activeMode, assist, revealedMap, setRevealedMap, 1);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeMode, assist, item, revealedMap]);

  const goTo = useCallback((index: number, options: { play?: boolean } = {}) => {
    if (index < 0 || index >= items.length) return;
    audioRef.current?.pause();
    setCurrentIndex(index);
    setShowNote(false);
    setShowVocab(false);
    setFavorite(false);
    replayCountRef.current = 0;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (options.play) {
      window.setTimeout(() => audioRef.current?.play().catch(() => undefined), 100);
    }
  }, [items.length]);

  const handleAnswer = useCallback(async (question: DauToeicQuestion, selected: string) => {
    if (answeredMap[question.id]) return;
    const correctAnswer = normalizeAnswer(question.correctAnswer);
    const selectedAnswer = normalizeAnswer(selected);
    const correct = selectedAnswer === correctAnswer;
    setAnsweredMap((prev) => ({ ...prev, [question.id]: selectedAnswer }));

    try {
      await fetch("/api/listening/progress", {
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
          assistPercent: assist,
          replayCount: replayCountRef.current,
          elapsedSeconds: elapsed,
        }),
      });
    } catch {
      // Saving progress is best-effort, matching the old Spring client.
    }

    if (correct && auto && currentIndex < items.length - 1) {
      window.setTimeout(() => goTo(currentIndex + 1, { play: true }), 450);
    }
  }, [activeMode, answeredMap, assist, auto, currentIndex, elapsed, goTo, item.id, items.length, level, partNum]);

  const currentQuestion = item.questions[0];

  return (
    <main className="min-h-dvh bg-white">
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 bg-gradient-to-r from-cyan-500 to-blue-800 px-7 text-white shadow-md">
        <Link
          href={`/listen?part=${partId}`}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-white/10 text-xl font-bold"
          aria-label="Thoát"
        >
          ←
        </Link>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-xl font-extrabold text-gold-ink">
          文
        </span>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold">
          Part {partNum} · Cấp độ {level} · Luyện nghe
        </h1>

        <nav className="hidden flex-1 items-center justify-center rounded-xl border border-white/25 bg-white/10 p-1 lg:flex">
          {modes.map(([key, icon, label]) => (
            <Link
              key={key}
              href={`/listen/practice?part=${partId}&level=${level}&mode=${key}&assist=${assist}&q=${currentIndex}`}
              className={`inline-flex min-w-36 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-extrabold ${
                activeMode === key ? "bg-white/20 ring-2 ring-white/35" : "hover:bg-white/10"
              }`}
            >
              <span>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setAuto((value) => !value)}
          className={`rounded-xl border border-white/30 px-4 py-2 text-sm font-extrabold ${
            auto ? "bg-white text-blue-700" : "bg-white/10 text-white"
          }`}
          title="Tự chuyển bài khi trả lời đúng"
        >
          Auto
        </button>
        <span className="min-w-14 text-center text-sm font-extrabold tabular-nums">{formatElapsed(elapsed)}</span>
        <select
          value={assist}
          className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-extrabold text-white"
          onChange={(event) => {
            window.location.href = `/listen/practice?part=${partId}&level=${level}&mode=${activeMode}&assist=${event.target.value}&q=${currentIndex}`;
          }}
          aria-label="Tỉ lệ hỗ trợ"
        >
          {assistOptions.map((value) => (
            <option key={value} className="text-ink" value={value}>
              {value}%
            </option>
          ))}
        </select>
      </header>

      <div className="grid min-h-[calc(100dvh-8rem)] lg:grid-cols-[1fr_1fr]">
        <section className="border-r border-slate-200 px-10 py-8">
          <p className="mb-8 text-xl italic text-ink">
            {partNum === 1
              ? "Select the one statement that best describes what you see in the picture."
              : "Select the best response to each question."}
          </p>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            {(item.audioUrl || currentQuestion?.audioUrl) && (
              <audio
                ref={audioRef}
                src={item.audioUrl ?? currentQuestion?.audioUrl ?? undefined}
                controls
                preload="none"
                className="w-full"
                onPlay={() => {
                  replayCountRef.current += 1;
                }}
                onRateChange={(event) => {
                  setPlaybackRate(event.currentTarget.playbackRate);
                }}
              />
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!audioRef.current) return;
                  rewindAudio(audioRef.current, 3);
                  replayCountRef.current += 1;
                }}
                className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-extrabold text-primary"
              >
                ↺ 3s
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!audioRef.current) return;
                  rewindAudio(audioRef.current, 5);
                  replayCountRef.current += 1;
                }}
                className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-extrabold text-primary"
              >
                ↺ 5s
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextRate = nextPlaybackRate(audioRef.current?.playbackRate ?? playbackRate);
                  if (audioRef.current) audioRef.current.playbackRate = nextRate;
                  setPlaybackRate(nextRate);
                }}
                className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-extrabold text-primary"
              >
                {playbackRate}x
              </button>
            </div>
          </div>

          {(item.imageUrl || currentQuestion?.imageUrl) && (
            <img
              src={item.imageUrl ?? currentQuestion?.imageUrl ?? undefined}
              alt="Listening question"
              className="mt-2 max-h-[62dvh] w-full object-contain opacity-75 grayscale"
            />
          )}
        </section>

        <section className="px-10 py-8">
          <div className="mb-4 flex items-center justify-between">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-4 py-1 text-sm font-extrabold text-ink">
              #{currentIndex + 1}/{items.length}
            </span>
            <button
              type="button"
              onClick={async () => {
                if (!currentQuestion) return;
                setFavorite((value) => !value);
                await postTool("/api/listening/favorites", {
                  part: partNum,
                  level,
                  itemId: item.id,
                  questionId: currentQuestion.id,
                });
              }}
              className={`rounded-xl border px-4 py-3 ${favorite ? "border-amber-300 bg-amber-50 text-primary" : "border-slate-200 text-primary"}`}
              aria-label="Yêu thích"
            >
              {favorite ? "★" : "☆"}
            </button>
          </div>
          <h2 className="mb-5 text-3xl font-extrabold text-ink">
            {partNum === 3 || partNum === 4 ? "Nhóm câu hỏi" : "Question"}
          </h2>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            {item.questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                item={item}
                question={question}
                index={index}
                mode={activeMode}
                assist={assist}
                answered={answeredMap[question.id] ?? null}
                revealedMap={revealedMap}
                fillValues={fillValues}
                onReveal={(optionKey, tokenIndexes) => {
                  const key = maskKey(question.id, optionKey);
                  setRevealedMap((prev) => ({
                    ...prev,
                    [key]: mergeIndexes(prev[key], tokenIndexes),
                  }));
                }}
                onFillValue={(key, value) => {
                  setFillValues((prev) => ({ ...prev, [key]: value }));
                }}
                onHint={(count) => revealNextWords(question, activeMode, assist, revealedMap, setRevealedMap, count)}
                onRevealAll={() => revealAllWords(question, assist, setRevealedMap)}
                onAnswer={(selected) => handleAnswer(question, selected)}
              />
            ))}
          </div>

          {showNote && currentQuestion && (
            <ToolBox
              title="Ghi chú"
              textareaName="note"
              placeholder="Viết ghi chú của bạn..."
              status={toolStatus}
              onSubmit={async (form) => {
                const payload = await postTool("/api/listening/notes", {
                  itemId: item.id,
                  questionId: currentQuestion.id,
                  note: String(form.get("note") ?? ""),
                });
                setToolStatus(payload?.data?.message ?? "Đã xử lý.");
              }}
            />
          )}
          {showVocab && currentQuestion && (
            <ToolBox
              title="Giỏ từ"
              textareaName="word"
              placeholder="Nhập từ hoặc cụm từ cần nhớ..."
              status={toolStatus}
              onSubmit={async (form) => {
                const payload = await postTool("/api/listening/vocab-basket", {
                  itemId: item.id,
                  questionId: currentQuestion.id,
                  word: String(form.get("word") ?? ""),
                  meaning: String(form.get("meaning") ?? ""),
                  example: currentQuestion.questionText ?? item.transcript ?? "",
                });
                setToolStatus(payload?.data?.message ?? "Đã xử lý.");
              }}
              secondaryInput
            />
          )}
        </section>
      </div>

      <footer className="sticky bottom-0 z-40 flex h-16 items-center justify-between bg-gradient-to-r from-cyan-500 to-blue-800 px-7 text-white">
        <div className="flex gap-3">
          <a
            href="mailto:support@quyngu.vn?subject=B%C3%A1o%20l%E1%BB%97i%20c%C3%A2u%20luy%E1%BB%87n%20nghe"
            className="rounded-xl bg-white px-5 py-2 text-sm font-extrabold text-red-500"
          >
            ⚑ Báo lỗi
          </a>
          <button onClick={() => setShowVocab((value) => !value)} className="rounded-xl bg-white px-5 py-2 text-sm font-extrabold text-primary">
            ☷ Giỏ từ
          </button>
          <button onClick={() => setShowNote((value) => !value)} className="rounded-xl bg-white px-5 py-2 text-sm font-extrabold text-primary">
            ✎ Ghi chú
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0} className="rounded-xl bg-blue-600 px-5 py-3 font-extrabold disabled:opacity-40">‹</button>
          <span className="rounded-xl bg-green-500 px-5 py-3 font-extrabold">{currentIndex + 1}/{items.length}</span>
          <button onClick={() => goTo(currentIndex + 1)} disabled={currentIndex >= items.length - 1} className="rounded-xl bg-blue-600 px-5 py-3 font-extrabold disabled:opacity-40">›</button>
        </div>
      </footer>
    </main>
  );
}

function QuestionCard({
  item,
  question,
  index,
  mode,
  assist,
  answered,
  revealedMap,
  fillValues,
  onReveal,
  onFillValue,
  onHint,
  onRevealAll,
  onAnswer,
}: {
  item: DauToeicPracticeItem;
  question: DauToeicQuestion;
  index: number;
  mode: PracticeMode;
  assist: number;
  answered: string | null;
  revealedMap: Record<string, number[]>;
  fillValues: Record<string, string>;
  onReveal: (optionKey: string, tokenIndexes: number[]) => void;
  onFillValue: (key: string, value: string) => void;
  onHint: (count: number) => void;
  onRevealAll: () => void;
  onAnswer: (selected: string) => void;
}) {
  const translations = useMemo(
    () => parseOptionTranslations(firstText(question.answerTranslationVi, question.translationVi, item.translation)),
    [item.translation, question.answerTranslationVi, question.translationVi],
  );
  const options = questionOptions(question);
  const correctAnswer = normalizeAnswer(question.correctAnswer);
  const correct = answered != null && answered === correctAnswer;

  return (
    <article className="mb-8 last:mb-0">
      <h3 className="mb-5 text-xl font-extrabold text-ink">
        {question.questionText || `Question ${index + 1}`}
      </h3>

      {(mode === "fill" || mode === "flip") && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <strong className="text-base text-ink">
            Nghe & {mode === "fill" ? "Điền từ" : "Lật từ"} - {assist}%
          </strong>
          <div className="flex gap-6 text-sm font-extrabold text-ink">
            <button type="button" onClick={() => onHint(1)}>
              {mode === "fill" ? "Gợi ý" : "Lật từ tiếp"}
            </button>
            {mode === "flip" && (
              <button type="button" onClick={() => onHint(3)}>
                Lật 3 từ
              </button>
            )}
            <button type="button" onClick={onRevealAll}>
              Mở tất cả
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {options.map((option) => (
          <AnswerOption
            key={option.key}
            questionId={question.id}
            optionKey={option.key}
            text={option.text}
            translation={translations[option.key]}
            correctAnswer={correctAnswer}
            selected={answered}
            mode={mode}
            assist={assist}
            revealedIndexes={revealedMap[maskKey(question.id, option.key)] ?? []}
            fillValues={fillValues}
            onReveal={(tokenIndexes) => onReveal(option.key, tokenIndexes)}
            onFillValue={onFillValue}
            onAnswer={() => onAnswer(option.key)}
          />
        ))}
      </div>

      {answered && (
        <small className={`mt-4 block text-sm font-extrabold ${correct ? "text-emerald-600" : "text-red-600"}`} aria-live="polite">
          {correct ? "Đúng" : `Chưa đúng. Đáp án đúng: ${correctAnswer}`}
        </small>
      )}

      {answered && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-ink">
          <strong>Kết quả</strong>
          <p className="mt-1">
            {correct
              ? `Bạn chọn ${answered}. Đáp án đúng.`
              : `Bạn chọn ${answered}. Đáp án đúng là ${correctAnswer}.`}
          </p>
          {firstText(question.answerTranslationVi, question.translationVi, item.translation) && (
            <div className="mt-4">
              <strong>Dịch nghĩa câu hỏi</strong>
              <p className="mt-1 whitespace-pre-wrap">{firstText(question.answerTranslationVi, question.translationVi, item.translation)}</p>
            </div>
          )}
          {firstText(question.vocabulary, item.vocabulary) && (
            <div className="mt-4">
              <strong>Từ vựng nên học</strong>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{firstText(question.vocabulary, item.vocabulary)}</pre>
            </div>
          )}
        </section>
      )}
    </article>
  );
}

function AnswerOption({
  questionId,
  optionKey,
  text,
  translation,
  correctAnswer,
  selected,
  mode,
  assist,
  revealedIndexes,
  fillValues,
  onReveal,
  onFillValue,
  onAnswer,
}: {
  questionId: string;
  optionKey: string;
  text: string;
  translation?: string;
  correctAnswer: string;
  selected: string | null;
  mode: PracticeMode;
  assist: number;
  revealedIndexes: number[];
  fillValues: Record<string, string>;
  onReveal: (tokenIndexes: number[]) => void;
  onFillValue: (key: string, value: string) => void;
  onAnswer: () => void;
}) {
  const isSelected = selected === optionKey;
  const isCorrectChoice = selected != null && correctAnswer === optionKey;
  const isWrongChoice = isSelected && selected !== correctAnswer;
  const showNormalText = mode === "normal" && selected != null;
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
      <input
        type="radio"
        checked={isSelected}
        readOnly
        tabIndex={-1}
        className="mt-1"
        aria-label={`Đáp án ${optionKey}`}
      />
      <span className="min-w-10">({optionKey})</span>
      <span className="min-w-0 flex-1">
        {showNormalText && <span>{text}</span>}
        {mode === "bilingual" && (
          <>
            <span>{text}</span>
            {translation && <span className="mt-2 block text-sm font-bold text-ink">{translation}</span>}
          </>
        )}
        {mode === "fill" && (
          <MaskedText
            questionId={questionId}
            optionKey={optionKey}
            text={text}
            assist={assist}
            variant="fill"
            revealedIndexes={revealedIndexes}
            fillValues={fillValues}
            onReveal={onReveal}
            onFillValue={onFillValue}
          />
        )}
        {mode === "flip" && (
          <MaskedText
            questionId={questionId}
            optionKey={optionKey}
            text={text}
            assist={assist}
            variant="flip"
            revealedIndexes={revealedIndexes}
            fillValues={fillValues}
            onReveal={onReveal}
            onFillValue={onFillValue}
          />
        )}
      </span>
    </div>
  );
}

function MaskedText({
  questionId,
  optionKey,
  text,
  assist,
  variant,
  revealedIndexes,
  fillValues,
  onReveal,
  onFillValue,
}: {
  questionId: string;
  optionKey: string;
  text: string;
  assist: number;
  variant: "fill" | "flip";
  revealedIndexes: number[];
  fillValues: Record<string, string>;
  onReveal: (tokenIndexes: number[]) => void;
  onFillValue: (key: string, value: string) => void;
}) {
  const tokens = useMemo(() => tokenize(text), [text]);
  const hiddenIndexes = useMemo(() => chooseHiddenIndexes(tokens, assist), [assist, tokens]);
  const hiddenSet = useMemo(() => new Set(hiddenIndexes), [hiddenIndexes]);
  const revealedSet = useMemo(() => new Set(revealedIndexes), [revealedIndexes]);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-2">
      {tokens.map((token, index) => {
        if (token.type === "space") return <span key={index}> </span>;
        if (!hiddenSet.has(index)) return <span key={index}>{token.value}</span>;
        if (revealedSet.has(index)) {
          return variant === "flip" ? (
            <span key={index} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1 text-emerald-700">
              {token.value}
            </span>
          ) : (
            <span key={index}>{token.value}</span>
          );
        }
        if (variant === "fill") {
          const key = fillKey(questionId, optionKey, index);
          const value = fillValues[key] ?? "";
          const normalizedValue = normalizeWord(value);
          const normalizedAnswer = normalizeWord(token.value);
          const checkedClass = !normalizedValue
            ? "border-slate-300 bg-white"
            : normalizedValue === normalizedAnswer
              ? "border-emerald-400 bg-emerald-50"
              : "border-red-300 bg-red-50";
          return (
            <input
              key={index}
              value={value}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onChange={(event) => onFillValue(key, event.target.value)}
              className={`mx-1 h-8 rounded-lg border px-2 text-sm outline-none ${checkedClass}`}
              style={{ width: Math.max(48, token.value.length * 12) }}
              autoComplete="off"
              spellCheck={false}
              aria-label="Điền từ còn thiếu"
            />
          );
        }
        return (
          <button
            key={index}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onReveal([index]);
            }}
            className="mx-1 rounded-lg border border-slate-300 bg-slate-100 px-3 py-1 tracking-[0.25em] text-ink"
            aria-label="Lật từ"
          >
            {"•".repeat(Math.max(3, Math.min(token.value.length, 10)))}
          </button>
        );
      })}
    </span>
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
      <textarea
        name={textareaName}
        className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm"
        rows={3}
        placeholder={placeholder}
      />
      {secondaryInput && (
        <input
          name="meaning"
          className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm"
          placeholder="Nghĩa"
          autoComplete="off"
        />
      )}
      <button className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-extrabold text-gold-ink" type="submit">
        Lưu
      </button>
      {status && <small className="ml-3 text-sm font-bold text-muted">{status}</small>}
    </form>
  );
}

function revealNextWords(
  question: DauToeicQuestion,
  mode: PracticeMode,
  assist: number,
  revealedMap: Record<string, number[]>,
  setRevealedMap: React.Dispatch<React.SetStateAction<Record<string, number[]>>>,
  count: number,
) {
  if (mode !== "fill" && mode !== "flip") return;
  let remaining = count;
  const additions: Record<string, number[]> = {};
  for (const option of questionOptions(question)) {
    if (remaining <= 0) break;
    const key = maskKey(question.id, option.key);
    const already = new Set([...(revealedMap[key] ?? []), ...(additions[key] ?? [])]);
    const indexes = chooseHiddenIndexes(tokenize(option.text), assist);
    for (const index of indexes) {
      if (remaining <= 0) break;
      if (already.has(index)) continue;
      additions[key] = [...(additions[key] ?? []), index];
      already.add(index);
      remaining -= 1;
    }
  }
  if (Object.keys(additions).length === 0) return;
  setRevealedMap((prev) => {
    const next = { ...prev };
    for (const [key, indexes] of Object.entries(additions)) {
      next[key] = mergeIndexes(next[key], indexes);
    }
    return next;
  });
}

function revealAllWords(
  question: DauToeicQuestion,
  assist: number,
  setRevealedMap: React.Dispatch<React.SetStateAction<Record<string, number[]>>>,
) {
  const additions: Record<string, number[]> = {};
  for (const option of questionOptions(question)) {
    additions[maskKey(question.id, option.key)] = chooseHiddenIndexes(tokenize(option.text), assist);
  }
  setRevealedMap((prev) => {
    const next = { ...prev };
    for (const [key, indexes] of Object.entries(additions)) {
      next[key] = mergeIndexes(next[key], indexes);
    }
    return next;
  });
}

function questionOptions(question: DauToeicQuestion): Array<{ key: string; text: string }> {
  return [
    { key: "A", text: question.optionA },
    { key: "B", text: question.optionB },
    { key: "C", text: question.optionC },
    { key: "D", text: question.optionD },
  ].filter((option): option is { key: string; text: string } => Boolean(option.text));
}

function normalizeSavedAnswers(
  saved: Record<string, string> | undefined,
): Record<string, string> {
  if (!saved) return {};
  const normalized: Record<string, string> = {};
  for (const [questionId, answer] of Object.entries(saved)) {
    if (questionId && answer) {
      normalized[questionId] = normalizeAnswer(answer);
    }
  }
  return normalized;
}

function firstUnansweredIndex(
  items: DauToeicPracticeItem[],
  answers: Record<string, string>,
): number {
  for (let index = 0; index < items.length; index += 1) {
    const questions = items[index]?.questions ?? [];
    const allAnswered =
      questions.length > 0 && questions.every((question) => answers[question.id]);
    if (!allAnswered) return index;
  }
  // Every question is answered: keep the learner on the last item.
  return Math.max(0, items.length - 1);
}

function initialItemIndex(
  items: DauToeicPracticeItem[],
  answers: Record<string, string>,
) {
  const total = items.length;
  if (typeof window === "undefined") return 0;

  // If the learner has already answered something, always resume at the first
  // unanswered question (e.g. 4/90 done → open item 5). A stale `q` param left
  // in the URL from the auto-sync effect must NOT override this resume logic.
  const hasSavedAnswers = Object.keys(answers).length > 0;
  if (hasSavedAnswers) {
    return firstUnansweredIndex(items, answers);
  }

  // No saved progress: honour an explicit `q` param (deep link / in-page nav).
  const params = new URLSearchParams(window.location.search);
  const rawParam = params.get("q");
  if (rawParam != null && rawParam !== "") {
    const raw = Number.parseInt(rawParam, 10);
    if (!Number.isNaN(raw)) {
      return Math.max(0, Math.min(Math.max(total - 1, 0), raw));
    }
  }
  return 0;
}

function chooseHiddenIndexes(tokens: Token[], percent: number) {
  const eligible = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.type === "word" && normalizeWord(token.value).length > 0);
  if (eligible.length === 0) return [];
  const count = Math.min(eligible.length, Math.max(1, Math.ceil(eligible.length * (percent / 100))));
  if (count >= eligible.length) return eligible.map(({ index }) => index);
  if (count === 1) {
    return [[...eligible].sort((left, right) => scoreWord(right.token.value) - scoreWord(left.token.value))[0].index];
  }
  const selected = new Set<number>();
  for (let step = 0; step < count; step += 1) {
    const position = Math.round(step * ((eligible.length - 1) / (count - 1)));
    selected.add(eligible[position].index);
  }
  for (const { index } of eligible) {
    if (selected.size >= count) break;
    selected.add(index);
  }
  return Array.from(selected).sort((left, right) => left - right);
}

function tokenize(text: string): Token[] {
  const matches = text.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)?|\s+|./g) || [];
  return matches.map((value) => ({
    value,
    type: /^\s+$/.test(value) ? "space" : /^[A-Za-z]+(?:['’\-][A-Za-z]+)?$/.test(value) ? "word" : "punct",
  }));
}

function parseOptionTranslations(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text) return result;
  const parts = text
    .replace(/\r/g, "\n")
    .split(/\n+|(?=\([A-D]\))/g)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^\(?([A-D])\)?[\s.:-]*(.+)$/i);
    if (match) result[match[1].toUpperCase()] = match[2].trim();
  }
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

function rewindAudio(audio: HTMLAudioElement, seconds: number) {
  audio.currentTime = Math.max(0, audio.currentTime - seconds);
}

function nextPlaybackRate(rate: number) {
  if (rate < 1) return 1;
  if (rate < 1.25) return 1.25;
  if (rate < 1.5) return 1.5;
  return 0.75;
}

function mergeIndexes(existing: number[] | undefined, additions: number[]) {
  return Array.from(new Set([...(existing ?? []), ...additions])).sort((left, right) => left - right);
}

function fillKey(questionId: string, optionKey: string, tokenIndex: number) {
  return `${questionId}:${optionKey}:${tokenIndex}`;
}

function maskKey(questionId: string, optionKey: string) {
  return `${questionId}:${optionKey}`;
}

function firstText(...values: Array<string | null | undefined>) {
  const value = values.find((candidate) => candidate && String(candidate).trim().length > 0);
  return value == null ? "" : String(value).trim();
}

function normalizeWord(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
}

function normalizeAnswer(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function normalizeMode(value: string): PracticeMode {
  return value === "bilingual" || value === "fill" || value === "flip" ? value : "normal";
}

function scoreWord(word: string) {
  const normalized = normalizeWord(word);
  const suffixBoost = /(ing|tion|ment|able|ive|ous|ed|ly)$/.test(normalized) ? 3 : 0;
  return normalized.length + suffixBoost;
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
