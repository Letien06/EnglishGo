"use client";

/**
 * FlashcardGame — Full flashcard game with multiple modes.
 *
 * Modes: flashcard, quiz, typing, listening.
 * Port of flashcards.html game logic.
 */
import Link from "next/link";
import { useState, useCallback, useMemo, useEffect } from "react";
import type { VocabWordCard, VocabSetCard, VocabSetSession } from "@/types/vocab";

interface Props {
  session: VocabSetSession;
  initialMode: string;
  practiceOptions: VocabSetCard[];
  reviewMode: boolean;
}

type GameMode = "flashcard" | "quiz" | "typing" | "listening";

const MODES: { key: GameMode; label: string; icon: string }[] = [
  { key: "flashcard", label: "Flashcard", icon: "🃏" },
  { key: "quiz", label: "Quiz", icon: "📝" },
  { key: "typing", label: "Typing", icon: "⌨️" },
  { key: "listening", label: "Listening", icon: "🎧" },
];

export default function FlashcardGame({
  session,
  initialMode,
  reviewMode,
}: Props) {
  const words = session.words;
  const [mode, setMode] = useState<GameMode>(
    normalizeMode(initialMode),
  );

  if (words.length === 0) {
    return (
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <Link
          href={`/vocab/${session.set.id}`}
          className="text-accent text-sm"
        >
          ← Quay lại
        </Link>
        <div className="text-center py-20 text-muted">
          <p className="text-4xl mb-3">📭</p>
          <p>Không có từ vựng nào để luyện tập.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">
      {/* Back link */}
      <Link
        href={reviewMode ? "/vocab?tab=progress" : `/vocab/${session.set.id}`}
        className="text-accent text-sm"
      >
        ← Quay lại
      </Link>

      {/* Header */}
      <section>
        <span className="text-xs uppercase tracking-widest text-muted font-semibold">
          {session.set.topic}
        </span>
        <h1 className="text-xl font-bold text-ink mt-1">
          {session.set.title}
        </h1>
        <p className="text-sm text-muted">
          <strong>{words.length}</strong> từ sẵn sàng
        </p>
      </section>

      {/* Mode picker */}
      <nav className="flex gap-2 flex-wrap">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === m.key
                ? "bg-accent text-white"
                : "bg-surface border border-line text-ink2 hover:bg-surface-soft"
            }`}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </nav>

      {/* Game surface */}
      <section className="min-h-[400px]">
        {mode === "flashcard" && <FlashcardMode words={words} />}
        {mode === "quiz" && <QuizMode words={words} />}
        {mode === "typing" && <TypingMode words={words} />}
        {mode === "listening" && <ListeningMode words={words} />}
      </section>
    </main>
  );
}

/* ================================================================== */
/*  Flashcard Mode                                                     */
/* ================================================================== */

function FlashcardMode({ words }: { words: VocabWordCard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  const word = words[index];

  function next(isKnown: boolean) {
    if (isKnown) setKnown((prev) => new Set(prev).add(word.id));
    setFlipped(false);
    if (index < words.length - 1) {
      setIndex(index + 1);
    }
  }

  async function submitReview(quality: number) {
    await fetch(`/api/vocab/words/${word.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quality }),
    });
  }

  const isLast = index === words.length - 1;
  const progress = ((index + 1) / words.length) * 100;

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-surface-soft overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted">
          {index + 1}/{words.length}
        </span>
      </div>

      {/* Card */}
      <div
        onClick={() => setFlipped(!flipped)}
        className="cursor-pointer mx-auto max-w-lg p-8 rounded-2xl bg-surface border border-line hover:border-accent/30 transition-all min-h-[250px] flex flex-col items-center justify-center text-center"
      >
        {!flipped ? (
          <>
            <p className="text-3xl font-bold text-ink mb-2">{word.word}</p>
            {word.phonetic && (
              <p className="text-sm text-muted mb-4">{word.phonetic}</p>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                speak(word.word);
              }}
              className="text-accent"
            >
              🔊 Phát âm
            </button>
            <p className="text-xs text-muted mt-4">Nhấn để xem nghĩa</p>
          </>
        ) : (
          <>
            <p className="text-xl font-bold text-accent mb-2">
              {word.meaning}
            </p>
            {word.partOfSpeech && (
              <span className="px-2 py-0.5 rounded bg-surface-soft text-xs text-muted mb-2">
                {word.partOfSpeech}
              </span>
            )}
            {word.example && (
              <p className="text-sm text-muted italic mt-2">
                &quot;{word.example}&quot;
              </p>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <button
          onClick={() => {
            submitReview(1);
            next(false);
          }}
          className="px-6 py-3 rounded-xl bg-red-500/20 text-red-400 font-semibold hover:bg-red-500/30 transition-colors"
        >
          ❌ Chưa nhớ
        </button>
        <button
          onClick={() => {
            submitReview(4);
            next(true);
          }}
          className="px-6 py-3 rounded-xl bg-green-500/20 text-green-400 font-semibold hover:bg-green-500/30 transition-colors"
        >
          ✅ Đã nhớ
        </button>
      </div>

      {/* Completion */}
      {isLast && flipped && (
        <div className="text-center py-6">
          <p className="text-lg font-bold text-ink">
            🎉 Hoàn thành! Bạn nhớ {known.size}/{words.length} từ
          </p>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Quiz Mode                                                          */
/* ================================================================== */

function QuizMode({ words }: { words: VocabWordCard[] }) {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  const word = words[index];

  const options = useMemo(() => {
    if (!word) return [];
    const correct = word.meaning;
    const others = words
      .filter((w) => w.id !== word.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((w) => w.meaning);
    const all = [correct, ...others].sort(() => Math.random() - 0.5);
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, words]);

  function answer(choice: number) {
    if (answered !== null) return;
    setAnswered(choice);
    const isCorrect = options[choice] === word.meaning;
    if (isCorrect) setScore((s) => s + 1);

    const quality = isCorrect ? 4 : 1;
    fetch(`/api/vocab/words/${word.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quality }),
    });

    setTimeout(() => {
      setAnswered(null);
      if (index < words.length - 1) {
        setIndex(index + 1);
      } else {
        setFinished(true);
      }
    }, 1200);
  }

  if (finished) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-4">🎉</p>
        <p className="text-2xl font-bold text-ink">
          {score}/{words.length} câu đúng
        </p>
        <p className="text-muted mt-2">
          {score === words.length
            ? "Xuất sắc! 🏆"
            : score >= words.length * 0.7
              ? "Tốt lắm! 👏"
              : "Cần ôn thêm! 💪"}
        </p>
        <button
          onClick={() => {
            setIndex(0);
            setScore(0);
            setFinished(false);
          }}
          className="mt-4 px-6 py-2 rounded-lg bg-accent text-white font-semibold"
        >
          Chơi lại
        </button>
      </div>
    );
  }

  const progress = ((index + 1) / words.length) * 100;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-surface-soft overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted">
          {score} ✓ · {index + 1}/{words.length}
        </span>
      </div>

      {/* Question */}
      <div className="p-6 rounded-2xl bg-surface border border-line text-center">
        <button onClick={() => speak(word.word)} className="text-accent mb-2">
          🔊
        </button>
        <p className="text-2xl font-bold text-ink">{word.word}</p>
        {word.phonetic && (
          <p className="text-sm text-muted">{word.phonetic}</p>
        )}
      </div>

      {/* Options */}
      <div className="grid gap-3">
        {options.map((opt, i) => {
          let cls = "bg-surface border border-line text-ink hover:bg-surface-soft";
          if (answered !== null) {
            if (opt === word.meaning) {
              cls = "bg-green-500/20 border border-green-500/40 text-green-400";
            } else if (i === answered) {
              cls = "bg-red-500/20 border border-red-500/40 text-red-400";
            }
          }
          return (
            <button
              key={i}
              onClick={() => answer(i)}
              disabled={answered !== null}
              className={`w-full text-left px-5 py-3 rounded-xl text-sm font-medium transition-colors ${cls}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Typing Mode                                                        */
/* ================================================================== */

function TypingMode({ words }: { words: VocabWordCard[] }) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const word = words[index];

  const check = useCallback(() => {
    if (!input.trim()) return;
    const isCorrect =
      input.trim().toLowerCase() === word.word.toLowerCase();
    setResult(isCorrect ? "correct" : "wrong");
    if (isCorrect) setScore((s) => s + 1);

    const quality = isCorrect ? 4 : 1;
    fetch(`/api/vocab/words/${word.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quality }),
    });

    setTimeout(() => {
      setInput("");
      setResult(null);
      if (index < words.length - 1) {
        setIndex(index + 1);
      } else {
        setFinished(true);
      }
    }, 1500);
  }, [input, word, index, words.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" && result === null) check();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [check, result]);

  if (finished) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-4">🎉</p>
        <p className="text-2xl font-bold text-ink">
          {score}/{words.length} câu đúng
        </p>
        <button
          onClick={() => {
            setIndex(0);
            setScore(0);
            setFinished(false);
          }}
          className="mt-4 px-6 py-2 rounded-lg bg-accent text-white font-semibold"
        >
          Chơi lại
        </button>
      </div>
    );
  }

  const progress = ((index + 1) / words.length) * 100;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-surface-soft overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted">
          {score} ✓ · {index + 1}/{words.length}
        </span>
      </div>

      {/* Hint: meaning */}
      <div className="p-6 rounded-2xl bg-surface border border-line text-center">
        <p className="text-xs text-muted mb-2 uppercase tracking-wider">
          Gõ từ tiếng Anh cho nghĩa sau:
        </p>
        <p className="text-xl font-bold text-accent">{word.meaning}</p>
        {word.partOfSpeech && (
          <span className="text-xs text-muted">({word.partOfSpeech})</span>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập từ tiếng Anh..."
          disabled={result !== null}
          className={`flex-1 px-4 py-3 rounded-xl border text-ink text-center text-lg font-semibold ${
            result === "correct"
              ? "bg-green-500/10 border-green-500/40"
              : result === "wrong"
                ? "bg-red-500/10 border-red-500/40"
                : "bg-surface border-line"
          }`}
          autoFocus
        />
      </div>

      {result === "wrong" && (
        <p className="text-center text-sm text-red-400">
          Đáp án: <strong>{word.word}</strong>
        </p>
      )}

      <div className="flex justify-center">
        <button
          onClick={check}
          disabled={!input.trim() || result !== null}
          className="px-8 py-3 rounded-xl bg-accent text-white font-semibold disabled:opacity-50"
        >
          Kiểm tra
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Listening Mode                                                     */
/* ================================================================== */

function ListeningMode({ words }: { words: VocabWordCard[] }) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const word = words[index];

  useEffect(() => {
    // Auto-play on mount and when index changes
    speak(word.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const check = useCallback(() => {
    if (!input.trim()) return;
    const isCorrect =
      input.trim().toLowerCase() === word.word.toLowerCase();
    setResult(isCorrect ? "correct" : "wrong");
    if (isCorrect) setScore((s) => s + 1);

    const quality = isCorrect ? 4 : 1;
    fetch(`/api/vocab/words/${word.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quality }),
    });

    setTimeout(() => {
      setInput("");
      setResult(null);
      if (index < words.length - 1) {
        setIndex(index + 1);
      } else {
        setFinished(true);
      }
    }, 1500);
  }, [input, word, index, words.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" && result === null) check();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [check, result]);

  if (finished) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-4">🎧</p>
        <p className="text-2xl font-bold text-ink">
          {score}/{words.length} câu đúng
        </p>
        <button
          onClick={() => {
            setIndex(0);
            setScore(0);
            setFinished(false);
          }}
          className="mt-4 px-6 py-2 rounded-lg bg-accent text-white font-semibold"
        >
          Chơi lại
        </button>
      </div>
    );
  }

  const progress = ((index + 1) / words.length) * 100;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-surface-soft overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted">
          {score} ✓ · {index + 1}/{words.length}
        </span>
      </div>

      {/* Listen prompt */}
      <div className="p-8 rounded-2xl bg-surface border border-line text-center">
        <p className="text-xs text-muted mb-4 uppercase tracking-wider">
          Nghe và gõ lại từ tiếng Anh
        </p>
        <button
          onClick={() => speak(word.word)}
          className="text-5xl hover:scale-110 transition-transform"
        >
          🔊
        </button>
        <p className="text-xs text-muted mt-3">Nhấn để nghe lại</p>
      </div>

      {/* Input */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Gõ từ bạn nghe được..."
        disabled={result !== null}
        className={`w-full px-4 py-3 rounded-xl border text-ink text-center text-lg font-semibold ${
          result === "correct"
            ? "bg-green-500/10 border-green-500/40"
            : result === "wrong"
              ? "bg-red-500/10 border-red-500/40"
              : "bg-surface border-line"
        }`}
        autoFocus
      />

      {result === "wrong" && (
        <p className="text-center text-sm text-red-400">
          Đáp án: <strong>{word.word}</strong> — {word.meaning}
        </p>
      )}

      <div className="flex justify-center">
        <button
          onClick={check}
          disabled={!input.trim() || result !== null}
          className="px-8 py-3 rounded-xl bg-accent text-white font-semibold disabled:opacity-50"
        >
          Kiểm tra
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function speak(text: string) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }
}

function normalizeMode(raw: string): GameMode {
  const valid: GameMode[] = ["flashcard", "quiz", "typing", "listening"];
  return valid.includes(raw as GameMode) ? (raw as GameMode) : "flashcard";
}
