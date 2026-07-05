"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PracticeMobileMenu from "../../_components/PracticeMobileMenu";
import { markVisited, routeKey } from "@/lib/nav/session-nav";
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

  // Mark this practice route as visited so re-opening it later this session
  // (e.g. tapping "Luyện ngay" again) does not flash the loading overlay.
  useEffect(() => {
    markVisited(
      routeKey("/listen/practice", {
        part: partId,
        level: String(level),
        mode,
        assist: String(assist),
      }),
    );
  }, [partId, level, mode, assist]);

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
      <header className="sticky top-0 z-40 flex h-16 items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-800 px-3 text-white shadow-md sm:gap-4 sm:px-7">
        <Link
          href={`/listen?part=${partId}`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/10 text-xl font-bold"
          aria-label="Thoát"
        >
          ←
        </Link>
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-extrabold text-gold-ink sm:inline-flex">
          文
        </span>
        <h1 className="min-w-0 flex-1 truncate text-base font-extrabold sm:text-xl">
          Part {partNum} · Cấp {level} · Nghe
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
          className={`hidden rounded-xl border border-white/30 px-4 py-2 text-sm font-extrabold lg:block ${
            auto ? "bg-white text-blue-700" : "bg-white/10 text-white"
          }`}
          title="Tự chuyển bài khi trả lời đúng"
        >
          Auto
        </button>
        <span className="hidden min-w-14 text-center text-sm font-extrabold tabular-nums lg:inline">{formatElapsed(elapsed)}</span>
        <select
          value={assist}
          className="hidden rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-extrabold text-white lg:block"
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

        <PracticeMobileMenu
          modes={modes}
          activeMode={activeMode}
          auto={auto}
          onToggleAuto={() => setAuto((value) => !value)}
          assist={assist}
          assistOptions={assistOptions}
          elapsed={formatElapsed(elapsed)}
          modeHref={(m) => `/listen/practice?part=${partId}&level=${level}&mode=${m}&assist=${assist}&q=${currentIndex}`}
          assistHref={(v) => `/listen/practice?part=${partId}&level=${level}&mode=${activeMode}&assist=${v}&q=${currentIndex}`}
        />
      </header>

      <div className="grid min-h-[calc(100dvh-8rem)] lg:grid-cols-[1fr_1fr]">
        <section className="border-b border-slate-200 px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r lg:px-10 lg:py-8">
          <p className="mb-5 text-lg italic text-ink sm:text-xl lg:mb-8">
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

        <section className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
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
                partNum={partNum}
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
        </section>
      </div>

      <footer className="sticky bottom-0 z-40 flex h-16 items-center justify-between gap-2 bg-gradient-to-r from-cyan-500 to-blue-800 px-3 text-white sm:px-7">
        <div className="flex gap-2 sm:gap-3">
          <button onClick={() => setShowNote((value) => !value)} className="rounded-xl bg-white px-3 py-2 text-sm font-extrabold text-primary sm:px-5" aria-label="Ghi chú">
            ✎<span className="hidden sm:inline"> Ghi chú</span>
          </button>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0} className="rounded-xl bg-blue-600 px-4 py-3 font-extrabold disabled:opacity-40 sm:px-5">‹</button>
          <span className="rounded-xl bg-green-500 px-3 py-3 text-sm font-extrabold tabular-nums sm:px-5 sm:text-base">{currentIndex + 1}/{items.length}</span>
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
  partNum: number;
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
    () => parseOptionTranslations(cleanDisplayText(firstText(question.answerTranslationVi, question.translationVi, item.translation))),
    [item.translation, question.answerTranslationVi, question.translationVi],
  );
  const options = questionOptions(question, partNum);
  const correctAnswer = normalizeAnswer(question.correctAnswer);
  const correct = answered != null && answered === correctAnswer;
  const showQuestionText = partNum >= 3;
  const showOptionText = partNum >= 3;

  return (
    <article className="mb-8 last:mb-0">
      {showQuestionText ? (
        <h3 className="mb-5 text-xl font-extrabold text-ink">
          {normalizeQuestionText(partNum, question.questionText, index + 1)}
        </h3>
      ) : null}

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
            showOptionText={showOptionText}
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
          {firstText(question.answerTranslationVi, question.translationVi, item.translation) && (
            <SolutionBlock
              title="Dịch nghĩa câu hỏi"
              value={firstText(question.answerTranslationVi, question.translationVi, item.translation)}
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

function AnswerOption({
  questionId,
  optionKey,
  text,
  translation,
  showOptionText,
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
  showOptionText: boolean;
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
  const showNormalText = showOptionText && (mode === "normal" || selected != null);
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
        {!showOptionText && <span className="font-extrabold">{optionKey}</span>}
        {showOptionText && mode === "bilingual" && (
          <>
            <span>{text}</span>
            {translation && <span className="mt-2 block text-sm font-bold text-ink">{translation}</span>}
          </>
        )}
        {showOptionText && mode === "fill" && (
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
        {showOptionText && mode === "flip" && (
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

function questionOptions(question: DauToeicQuestion, partNum = question.part ?? 1): Array<{ key: string; text: string }> {
  return [
    { key: "A", text: question.optionA },
    { key: "B", text: question.optionB },
    { key: "C", text: question.optionC },
    { key: "D", text: question.optionD },
  ]
    .filter((option): option is { key: string; text: string } => {
      if (partNum === 2 && option.key === "D") return false;
      return Boolean(cleanDisplayText(option.text));
    })
    .map((option) => ({ ...option, text: cleanDisplayText(option.text) }));
}

function normalizeQuestionText(partNum: number, value: string | null | undefined, index: number): string {
  if (partNum === 1 || partNum === 2) return "";
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
