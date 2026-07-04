"use client";

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
  const activeMode = normalizeMode(mode);
  const items = session.items;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answeredMap, setAnsweredMap] = useState<Record<string, string>>({});
  const [showNote, setShowNote] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [auto, setAuto] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const [toolStatus, setToolStatus] = useState("");
  const startedAtRef = useRef(0);
  const item = items[currentIndex] ?? items[0];
  const firstQuestion = item.questions[0];

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
        mode,
      }),
    );
  }, [partId, level, mode]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("q", String(currentIndex));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [currentIndex]);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= items.length) return;
    setCurrentIndex(index);
    setShowNote(false);
    setShowVocab(false);
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
            <Link
              key={key}
              href={`/read/practice?part=${partId}&level=${level}&mode=${key}&q=${currentIndex}`}
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
        <PracticeMobileMenu
          modes={modes}
          activeMode={activeMode}
          auto={auto}
          onToggleAuto={() => setAuto((value) => !value)}
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
            <img src={item.imageUrl} alt="Reading material" className="mb-4 max-h-[48dvh] w-full object-contain" />
          )}

          {partNum !== 5 && item.transcript ? (
            <article className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-xl font-extrabold text-ink">
                {firstQuestion?.questionText || "Passage"}
              </h2>
              <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-ink">{item.transcript}</pre>
              {activeMode === "bilingual" && item.translation && (
                <pre className="mt-5 whitespace-pre-wrap border-t border-slate-200 pt-5 font-sans text-sm leading-relaxed text-muted">
                  {item.translation}
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
          {showVocab && firstQuestion && (
            <ToolBox
              title="Giỏ từ"
              textareaName="word"
              placeholder="Nhập từ hoặc cụm từ cần nhớ..."
              status={toolStatus}
              secondaryInput
              onSubmit={async (form) => {
                const payload = await postTool("/api/reading/vocab-basket", {
                  itemId: item.id,
                  questionId: firstQuestion.id,
                  word: String(form.get("word") ?? ""),
                  meaning: String(form.get("meaning") ?? ""),
                  example: currentReadingSnippet(item, firstQuestion),
                });
                setToolStatus(payload?.data?.message ?? "Đã xử lý.");
              }}
            />
          )}
        </section>
      </div>

      <footer className="sticky bottom-0 z-40 flex h-16 items-center justify-between gap-2 bg-gradient-to-r from-cyan-500 to-blue-800 px-3 text-white sm:px-7">
        <div className="flex gap-2 sm:gap-3">
          <a
            href="mailto:support@quyngu.vn?subject=B%C3%A1o%20l%E1%BB%97i%20c%C3%A2u%20luy%E1%BB%87n%20%C4%91%E1%BB%8Dc"
            className="rounded-xl bg-white px-3 py-2 text-sm font-extrabold text-red-500 sm:px-5"
          >
            ⚑<span className="hidden sm:inline"> Báo lỗi</span>
          </a>
          <button onClick={() => setShowVocab((value) => !value)} className="rounded-xl bg-white px-3 py-2 text-sm font-extrabold text-primary sm:px-5">
            ☷<span className="hidden sm:inline"> Giỏ từ</span>
          </button>
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
    () => parseOptionTranslations(firstText(question.answerTranslationVi, question.translationVi)),
    [question.answerTranslationVi, question.translationVi],
  );
  const options = questionOptions(question);
  const correctAnswer = normalizeAnswer(question.correctAnswer);
  const correct = answered != null && answered === correctAnswer;

  return (
    <article className="mb-8 last:mb-0">
      <h3 className="mb-4 text-xl font-extrabold text-ink">
        {question.questionText || `Question ${index + 1}`}
      </h3>
      {partNum === 5 && item.transcript && (
        <p className="mb-4 rounded-xl bg-slate-50 p-4 text-sm font-bold leading-relaxed text-ink">{item.transcript}</p>
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
        <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-ink">
          <strong>Kết quả</strong>
          <p className="mt-1">
            {correct ? `Bạn chọn ${answered}. Đáp án đúng.` : `Bạn chọn ${answered}. Đáp án đúng là ${correctAnswer}.`}
          </p>
          {firstText(question.explanationVi, question.explanationEn) && (
            <SolutionBlock title="Giải thích" value={firstText(question.explanationVi, question.explanationEn)} />
          )}
          {firstText(question.translationVi, item.translation) && (
            <SolutionBlock title="Dịch nghĩa" value={firstText(question.translationVi, item.translation)} />
          )}
          {question.answerTranslationVi && <SolutionBlock title="Dịch đáp án" value={question.answerTranslationVi} />}
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

function SolutionBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="mt-4">
      <strong>{title}</strong>
      <p className="mt-1 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function questionOptions(question: DauToeicQuestion): Array<{ key: string; text: string }> {
  return [
    { key: "A", text: question.optionA },
    { key: "B", text: question.optionB },
    { key: "C", text: question.optionC },
    { key: "D", text: question.optionD },
  ].filter((option): option is { key: string; text: string } => Boolean(option.text));
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

function readingInstruction(partNum: number) {
  if (partNum === 5) return "Choose the best word or phrase to complete the sentence.";
  if (partNum === 6) return "Choose the best option to complete the text.";
  return "Read the passage and choose the best answer.";
}

function currentReadingSnippet(item: DauToeicPracticeItem, question: DauToeicQuestion) {
  return firstText(item.transcript, question.questionText, question.optionA)?.slice(0, 1000);
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
