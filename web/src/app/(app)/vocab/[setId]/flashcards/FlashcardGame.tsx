"use client";

/**
 * FlashcardGame — Full vocab study game, ported from the legacy flashcards.html engine.
 *
 * Screens: hub → play → result (state machine).
 * Modes: flashcard, quiz (wordMeaning/context/meaningWord), matching, typing, listening, mixed.
 * Features: filters (set/mastery/order/amount), 6 game cards with points, SRS banner,
 * match history (localStorage), quiz chooser modal, direction toggle EN↔VN, letter hints,
 * timer + lives, feedback overlay, result screen with "Lưu & Hoàn thành", mute + TTS.
 */
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  VocabSetCard,
  VocabSetSession,
  VocabWordCard,
} from "@/types/vocab";
import useDialogFocus from "@/components/useDialogFocus";
import { consolidateVocabGameAnswers } from "@/lib/vocab-game-results";

interface Props {
  session: VocabSetSession;
  initialMode: string;
  practiceOptions: VocabSetCard[];
  reviewMode: boolean;
  isAuthenticated: boolean;
  loginHref: string;
  selectedMastery?: string;
  selectedOrder?: string;
  selectedAmount?: string;
}

type PlayMode =
  | "flashcard"
  | "quiz"
  | "matching"
  | "typing"
  | "listening"
  | "mixed";
type QuizMode = "wordMeaning" | "context" | "meaningWord";
type Screen = "hub" | "play" | "result";

interface AnswerRecord {
  id: number;
  word: string;
  meaning: string;
  partOfSpeech?: string;
  phonetic?: string;
  phoneticUs?: string;
  phoneticUk?: string;
  example?: string;
  audioUrl?: string;
  audioUsUrl?: string;
  audioUkUrl?: string;
  correct: boolean;
  selected: string;
  expected: string;
  mode: string;
}

interface HistoryEntry {
  id: number | string;
  mode: string;
  time: string;
  accuracy: number;
  score: number;
  totalWords?: number;
  correctWords?: number;
  wrongWords?: number;
}

interface FeedbackState {
  correct: boolean;
  selected: string;
  expected: string;
  item: VocabWordCard;
}

interface VocabGameDraftPayload {
  index: number;
  score: number;
  attempts: number;
  answers: AnswerRecord[];
  updatedAtMillis: number;
}

interface ModeTone {
  card: string;
  icon: string;
  badge: string;
}

const MODE_CARDS: {
  key: PlayMode;
  icon: string;
  title: string;
  desc: string;
  points: string;
  quiz?: boolean;
  hot?: boolean;
}[] = [
  { key: "flashcard", icon: "☷", title: "Flashcard", desc: "Lật thẻ học từ vựng", points: "+5" },
  { key: "quiz", icon: "☑", title: "Trắc nghiệm", desc: "Chọn đáp án đúng", points: "+10", quiz: true },
  { key: "matching", icon: "▦", title: "Nối từ với nghĩa", desc: "Ghép đôi từ vựng và nghĩa", points: "+10" },
  { key: "typing", icon: "T", title: "Gõ từ vựng", desc: "Nhìn nghĩa và gõ tiếng Anh", points: "+10" },
  { key: "listening", icon: "♫", title: "Nghe viết", desc: "Nghe phát âm và viết từ", points: "+15" },
  { key: "mixed", icon: "↗", title: "Tổng hợp", desc: "Trộn flashcard, quiz, gõ và nghe", points: "+20", hot: true },
];

const MODE_TONES: Record<PlayMode, ModeTone> = {
  flashcard: {
    card: "border-indigo-200 bg-indigo-50/80 hover:border-indigo-400",
    icon: "bg-indigo-100 text-indigo-700",
    badge: "bg-indigo-100 text-indigo-700",
  },
  quiz: {
    card: "border-orange-200 bg-orange-50/80 hover:border-orange-400",
    icon: "bg-orange-100 text-orange-700",
    badge: "bg-orange-100 text-orange-700",
  },
  matching: {
    card: "border-sky-200 bg-sky-50/80 hover:border-sky-400",
    icon: "bg-sky-100 text-sky-700",
    badge: "bg-sky-100 text-sky-700",
  },
  typing: {
    card: "border-emerald-200 bg-emerald-50/80 hover:border-emerald-400",
    icon: "bg-emerald-100 text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
  },
  listening: {
    card: "border-cyan-200 bg-cyan-50/80 hover:border-cyan-400",
    icon: "bg-cyan-100 text-cyan-700",
    badge: "bg-cyan-100 text-cyan-700",
  },
  mixed: {
    card: "border-fuchsia-200 bg-fuchsia-50/80 hover:border-fuchsia-400",
    icon: "bg-fuchsia-100 text-fuchsia-700",
    badge: "bg-fuchsia-100 text-fuchsia-700",
  },
};

const FlashcardBody = dynamic(() => import("./modes/FlashcardMode"), { loading: ModeLoading });
const QuizBody = dynamic(() => import("./modes/QuizMode"), { loading: ModeLoading });
const MatchingBody = dynamic(() => import("./modes/MatchingMode"), { loading: ModeLoading });
const TypingBody = dynamic(() => import("./modes/TypingMode"), { loading: ModeLoading });
const ListeningBody = dynamic(() => import("./modes/ListeningMode"), { loading: ModeLoading });

function ModeLoading() {
  return <div className="mx-auto min-h-72 max-w-2xl animate-pulse rounded-2xl border border-line bg-white" />;
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function normalize(value: string | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(cleanSpeechText(text));
  u.lang = "en-US";
  window.speechSynthesis.speak(u);
}

function cleanSpeechText(value: string): string {
  return value
    .trim()
    .replace(/\s*\((?:n|noun|v|verb|adj|adjective|adv|adverb|prep|preposition)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function audioUrlFor(item: VocabWordCard | AnswerRecord, accent: "us" | "uk" = "us"): string | undefined {
  if (accent === "uk") return item.audioUkUrl || item.audioUrl || item.audioUsUrl;
  return item.audioUsUrl || item.audioUrl || item.audioUkUrl;
}

function modeLabelFor(mode: PlayMode, quizMode: QuizMode): string {
  if (mode === "mixed") return "Tổng hợp";
  if (mode === "quiz") {
    return quizMode === "context"
      ? "Quiz ngữ cảnh"
      : quizMode === "meaningWord"
        ? "Quiz nghĩa → từ"
        : "Quiz từ → nghĩa";
  }
  return (
    {
      flashcard: "Flashcard",
      typing: "Gõ từ vựng",
      listening: "Nghe viết",
      matching: "Nối từ với nghĩa",
      mixed: "Tổng hợp",
      quiz: "Trắc nghiệm",
    }[mode] || "Tổng hợp"
  );
}

type ReviewMutation = {
  wordId: number;
  quality?: number;
  mastered?: true;
};

async function submitReviewBatch(reviews: ReviewMutation[]): Promise<number> {
  try {
    const res = await fetch("/api/vocab/reviews/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviews }),
    });
    return res.status;
  } catch {
    return 0;
  }
}

function parseGameDraft(raw: string | null): VocabGameDraftPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VocabGameDraftPayload>;
    return {
      index: typeof parsed.index === "number" ? parsed.index : 0,
      score: typeof parsed.score === "number" ? parsed.score : 0,
      attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0,
      answers: Array.isArray(parsed.answers) ? parsed.answers : [],
      updatedAtMillis: typeof parsed.updatedAtMillis === "number" ? parsed.updatedAtMillis : 0,
    };
  } catch {
    return null;
  }
}

/* ================================================================== */
/*  Root component                                                     */
/* ================================================================== */

export default function FlashcardGame({
  session,
  initialMode,
  practiceOptions,
  reviewMode,
  isAuthenticated,
  loginHref,
  selectedMastery = "learning",
  selectedOrder = "random",
  selectedAmount = "20",
}: Props) {
  const router = useRouter();
  const words = session.words;
  const setId = session.set.id;

  const startInPlay = initialMode && initialMode !== "menu";
  const [screen, setScreen] = useState<Screen>(startInPlay ? "play" : "hub");
  const [mode, setMode] = useState<PlayMode>(
    startInPlay && isPlayMode(initialMode) ? (initialMode as PlayMode) : "flashcard",
  );
  const [quizMode, setQuizMode] = useState<QuizMode>("wordMeaning");
  const [quizChooser, setQuizChooser] = useState(initialMode === "quiz");
  const [muted, setMuted] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => session.history ?? []);
  const [filterPending, setFilterPending] = useState(false);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const completionTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (completionTimerRef.current) window.clearTimeout(completionTimerRef.current);
  }, []);

  // Load history from localStorage after mount (avoids hydration mismatch).
  useEffect(() => {
    if (session.history?.length) return;
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(`englishgo-vocab-history-${setId}`);
        setHistory(raw ? (JSON.parse(raw) as HistoryEntry[]) : []);
      } catch {
        setHistory([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setId, session.history]);

  const persistHistory = useCallback(
    (next: HistoryEntry[]) => {
      const trimmed = next.slice(0, 8);
      setHistory(trimmed);
      try {
        localStorage.setItem(
          `englishgo-vocab-history-${setId}`,
          JSON.stringify(trimmed),
        );
      } catch {
        /* ignore */
      }
    },
    [setId],
  );

  const recordHistory = useCallback(
    (entry: Omit<HistoryEntry, "id" | "time">) => {
      const full: HistoryEntry = {
        ...entry,
        id: Date.now(),
        time: new Date().toLocaleString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      persistHistory([full, ...history]);
    },
    [history, persistHistory],
  );

  function startMode(next: PlayMode) {
    setMode(next);
    setQuizChooser(false);
    setScreen("play");
  }

  function startQuiz(next: QuizMode) {
    setQuizMode(next);
    setMode("quiz");
    setQuizChooser(false);
    setScreen("play");
  }

  function goHub() {
    setScreen("hub");
  }

  function applyFilters(next: {
    setId?: number;
    mastery?: string;
    order?: string;
    amount?: string;
  }) {
    setFilterPending(true);
    const params = new URLSearchParams({
      mode: "menu",
      mastery: next.mastery ?? selectedMastery,
      order: next.order ?? selectedOrder,
      amount: next.amount ?? selectedAmount,
    });
    if (session.set.externalPartId && !next.setId) {
      params.set("partId", session.set.externalPartId);
    }
    const targetSet = next.setId ?? setId;
    router.push(`/vocab/${targetSet}/flashcards?${params.toString()}`);
  }

  if (words.length === 0 && screen !== "hub") {
    // fall through to hub-style empty message handled below
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">
      {filterPending && (
        <div className="fixed inset-x-0 top-16 z-50 mx-auto w-fit rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-extrabold text-ink shadow-lg">
          Đang nạp bộ lọc từ vựng...
        </div>
      )}

      <Link
        href={reviewMode || session.set.sourceType === "DAUTOEIC" ? "/vocab?tab=learn" : `/vocab/${setId}`}
        className="text-accent text-sm"
      >
        ← Quay lại
      </Link>

      <section>
        <span className="text-xs uppercase tracking-widest text-muted font-semibold">
          {session.set.topic}
        </span>
        <h1 className="text-xl font-bold text-ink mt-1">{session.set.title}</h1>
        <p className="text-sm text-muted">
          <strong>{words.length}</strong> từ sẵn sàng
        </p>
      </section>

      {screen === "hub" && (
        <Hub
          words={words}
          setId={setId}
          practiceOptions={practiceOptions}
          selectedMastery={selectedMastery}
          selectedOrder={selectedOrder}
          selectedAmount={selectedAmount}
          isAuthenticated={isAuthenticated}
          loginHref={loginHref}
          muted={muted}
          history={history}
          quizChooser={quizChooser}
          onToggleMute={() => setMuted((m) => !m)}
          onStartMode={startMode}
          onOpenQuizChooser={() => setQuizChooser(true)}
          onCloseQuizChooser={() => setQuizChooser(false)}
          onStartQuiz={startQuiz}
          onClearHistory={() => persistHistory([])}
          onApplyFilters={applyFilters}
        />
      )}

      {screen === "play" && words.length > 0 && (
        <PlaySurface
          key={`${mode}-${quizMode}`}
          words={words}
          setId={setId}
          title={session.set.title}
          externalTestId={session.set.externalTestId}
          externalPartId={session.set.externalPartId}
          mode={mode}
          quizMode={quizMode}
          muted={muted}
          isAuthenticated={isAuthenticated}
          loginHref={loginHref}
          onExit={goHub}
          onFinish={(record) => {
            recordHistory(record);
            const destination = session.set.sourceType === "DAUTOEIC" && session.set.externalTestId
              ? `/vocab/dautoeic/${encodeURIComponent(session.set.externalTestId)}`
              : `/vocab/${setId}`;
            setCompletionNotice(
              session.set.sourceType === "DAUTOEIC"
                ? "Đã lưu kết quả. Đang quay lại chọn Part…"
                : "Đã lưu kết quả. Đang quay lại chủ đề…",
            );
            completionTimerRef.current = window.setTimeout(() => {
              router.push(destination);
            }, 850);
          }}
        />
      )}

      {screen === "play" && words.length === 0 && (
        <section className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="text-3xl mb-2">▥</p>
          <h2 className="font-bold text-ink">Không có từ phù hợp bộ lọc</h2>
          <p className="text-sm text-muted">
            Đổi bộ lọc sang tất cả hoặc thêm từ vào bộ này.
          </p>
        </section>
      )}

      {completionNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="study-completion-toast fixed inset-x-4 top-20 z-[70] mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-extrabold text-emerald-800 shadow-xl"
        >
          <span aria-hidden="true">✓</span>
          <span>{completionNotice}</span>
        </div>
      ) : null}
    </main>
  );
}

/* ================================================================== */
/*  Hub screen                                                         */
/* ================================================================== */

function Hub({
  words,
  setId,
  practiceOptions,
  selectedMastery,
  selectedOrder,
  selectedAmount,
  isAuthenticated,
  loginHref,
  muted,
  history,
  quizChooser,
  onToggleMute,
  onStartMode,
  onOpenQuizChooser,
  onCloseQuizChooser,
  onStartQuiz,
  onClearHistory,
  onApplyFilters,
}: {
  words: VocabWordCard[];
  setId: number;
  practiceOptions: VocabSetCard[];
  selectedMastery: string;
  selectedOrder: string;
  selectedAmount: string;
  isAuthenticated: boolean;
  loginHref: string;
  muted: boolean;
  history: HistoryEntry[];
  quizChooser: boolean;
  onToggleMute: () => void;
  onStartMode: (mode: PlayMode) => void;
  onOpenQuizChooser: () => void;
  onCloseQuizChooser: () => void;
  onStartQuiz: (mode: QuizMode) => void;
  onClearHistory: () => void;
  onApplyFilters: (next: {
    setId?: number;
    mastery?: string;
    order?: string;
    amount?: string;
  }) => void;
}) {
  return (
    <div className="space-y-6">
      {!isAuthenticated ? (
        <aside className="flex flex-col items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Bạn đang học thử. <strong>Đăng nhập</strong> để lưu kết quả, lịch ôn và điểm thưởng.
          </p>
          <Link
            href={loginHref}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-gold-ink"
          >
            Đăng nhập để lưu
          </Link>
        </aside>
      ) : null}
      {/* Filters */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect
          label="Bộ từ vựng"
          value={String(setId)}
          onChange={(v) => onApplyFilters({ setId: Number(v) })}
          options={
            practiceOptions.length
              ? practiceOptions.map((o) => ({ value: String(o.id), label: o.title }))
              : [{ value: String(setId), label: "Bộ hiện tại" }]
          }
        />
        <FilterSelect
          label="Bộ lọc"
          value={selectedMastery}
          onChange={(v) => onApplyFilters({ mastery: v })}
          options={[
            { value: "learning", label: "Chưa thuộc" },
            { value: "mastered", label: "Đã thuộc" },
            { value: "due", label: "Cần ôn lại" },
            { value: "all", label: "Tất cả" },
          ]}
        />
        <FilterSelect
          label="Thứ tự"
          value={selectedOrder}
          onChange={(v) => onApplyFilters({ order: v })}
          options={[
            { value: "random", label: "Ngẫu nhiên" },
            { value: "ordered", label: "Theo thứ tự" },
          ]}
        />
        <FilterSelect
          label="Số lượng"
          value={selectedAmount}
          onChange={(v) => onApplyFilters({ amount: v })}
          options={[
            { value: "20", label: "20 từ" },
            { value: "50", label: "50 từ" },
            { value: "all", label: "Tất cả" },
          ]}
        />
      </section>

      {/* Topline */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">Chọn game:</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleMute}
            className="px-3 py-1.5 rounded-lg bg-surface border border-line text-xs font-semibold text-ink2 hover:bg-surface-soft"
          >
            {muted ? "🔇 Bật tiếng" : "🔊 Tắt tiếng"}
          </button>
          <span className="text-sm text-muted">
            <b className="text-ink">{words.length}</b> từ sẵn sàng
          </span>
        </div>
      </div>

      {/* Game cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODE_CARDS.map((card) => {
          const tone = MODE_TONES[card.key];
          return (
            <button
              key={card.key}
              type="button"
              onClick={() =>
                card.quiz ? onOpenQuizChooser() : onStartMode(card.key)
              }
              className={`game-mode-card premium-card premium-card--interactive relative flex min-h-[170px] flex-col items-center justify-center gap-2 overflow-hidden p-5 text-center ${tone.card}`}
            >
              {card.hot && (
                <em className="absolute right-3 top-3 rounded bg-red-500 px-2 py-0.5 text-[10px] font-bold not-italic text-white">
                  HOT
                </em>
              )}
              <span className={`rounded-full px-4 py-3 text-2xl ${tone.icon}`}>{card.icon}</span>
              <strong className="text-lg font-extrabold text-ink">{card.title}</strong>
              <small className="text-sm font-medium text-ink2">{card.desc}</small>
              <b className={`mt-1 rounded-full px-3 py-1 text-sm font-bold ${tone.badge}`}>{card.points}</b>
            </button>
          );
        })}
      </section>

      {/* SRS banner */}
      <section className="flex flex-col items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/80 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <strong className="block text-ink">Ôn tập ngắt quãng (SRS)</strong>
          <span className="text-sm text-muted">
            Hệ thống tự động nhắc lại các từ bạn sắp quên. Học ít, nhớ lâu.
          </span>
        </div>
        <button
          type="button"
          onClick={() => onStartMode("flashcard")}
          className="game-utility-button shrink-0 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Bắt đầu ôn tập
        </button>
      </section>

      {/* History */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Lịch sử đấu</h2>
          <button
            type="button"
            onClick={onClearHistory}
            className="text-xs text-muted hover:text-ink"
          >
            Xóa lịch sử
          </button>
        </header>
        {history.length ? (
          <div className="space-y-2">
            {history.map((item) => (
              <article
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <div>
                  <strong className="block text-sm text-ink">{item.mode}</strong>
                  <span className="text-xs text-muted">{item.time}</span>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <small className="block text-[10px] text-muted uppercase">
                      Độ chính xác
                    </small>
                    <b className="text-sm text-ink">{item.accuracy}%</b>
                  </div>
                  <div>
                    <small className="block text-[10px] text-muted uppercase">
                      Điểm
                    </small>
                    <b className="text-sm text-accent">+{item.score}</b>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Chưa có lượt học nào trong trình duyệt này.
          </p>
        )}
      </section>

      {quizChooser && (
        <QuizChooser onClose={onCloseQuizChooser} onSelect={onStartQuiz} />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuizChooser({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (mode: QuizMode) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, onClose, dialogRef);
  const choices: { mode: QuizMode; title: string; desc: string; tone: string }[] = [
    {
      mode: "wordMeaning",
      title: "Từ → Nghĩa",
      desc: "Nhìn từ tiếng Anh, chọn nghĩa đúng",
      tone: "border-blue-400/50 hover:bg-blue-500/10",
    },
    {
      mode: "context",
      title: "Ngữ cảnh",
      desc: "Che từ trong ví dụ, chọn đáp án phù hợp với câu",
      tone: "border-purple-400/50 hover:bg-purple-500/10",
    },
    {
      mode: "meaningWord",
      title: "Nghĩa → Từ",
      desc: "Nhìn nghĩa tiếng Việt, chọn từ đúng",
      tone: "border-green-400/50 hover:bg-green-500/10",
    },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Đóng chọn chế độ Quiz" onClick={onClose} />
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="quiz-chooser-title" className="relative w-full max-w-md space-y-3 rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <button
          type="button"
          data-dialog-initial-focus
          onClick={onClose}
          className="absolute right-4 top-4 text-xl text-muted hover:text-ink"
          aria-label="Đóng"
        >
          ×
        </button>
        <h2 id="quiz-chooser-title" className="text-lg font-bold text-ink">Chọn chế độ Quiz</h2>
        {choices.map((c) => (
          <button
            key={c.mode}
            type="button"
            onClick={() => onSelect(c.mode)}
            className={`block w-full rounded-xl border bg-surface px-4 py-3 text-left transition-colors ${c.tone}`}
          >
            <strong className="block text-ink">{c.title}</strong>
            <span className="text-xs text-muted">{c.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Play surface — one instance per game session                       */
/* ================================================================== */

interface MatchItem {
  id: number;
  word: string;
  meaning: string;
}

function PlaySurface({
  words,
  setId,
  title,
  externalTestId,
  externalPartId,
  mode,
  quizMode,
  muted,
  isAuthenticated,
  loginHref,
  onExit,
  onFinish,
}: {
  words: VocabWordCard[];
  setId: number;
  title: string;
  externalTestId?: string;
  externalPartId?: string;
  mode: PlayMode;
  quizMode: QuizMode;
  muted: boolean;
  isAuthenticated: boolean;
  loginHref: string;
  onExit: () => void;
  onFinish: (record: {
    mode: string;
    accuracy: number;
    score: number;
    startedAtMillis: number;
    totalWords: number;
    correctWords: number;
    wrongWords: number;
  }) => void;
}) {
  const startedAtRef = useRef(Date.now());
  const [index, setIndex] = useState(0);
  const [reverse, setReverse] = useState(mode === "typing");
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");
  const [hintRevealed, setHintRevealed] = useState<number[]>([]);
  const [status, setStatus] = useState<{ text: string; tone: string }>({
    text: "",
    tone: "",
  });
  const [score, setScore] = useState(0);
  const [, setCorrect] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [selected, setSelected] = useState("");
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [timer, setTimer] = useState(30);
  const [lives, setLives] = useState(5);
  const [showResult, setShowResult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Matching state
  const [matchWords, setMatchWords] = useState<MatchItem[]>([]);
  const [matchMeanings, setMatchMeanings] = useState<MatchItem[]>([]);
  const [matchedIds, setMatchedIds] = useState<number[]>([]);
  const [selWord, setSelWord] = useState<number | null>(null);
  const [selMeaning, setSelMeaning] = useState<number | null>(null);

  const timerRef = useRef<number | null>(null);
  const draftTimerRef = useRef<number | null>(null);
  const hydratedDraftRef = useRef(false);
  const reviewsSavedRef = useRef(false);
  const draftStorageKey = `englishgo-vocab-draft-${setId}-${externalPartId ?? "all"}-${mode}-${quizMode}`;

  const activeMode: PlayMode = useMemo(() => {
    if (mode !== "mixed") return mode;
    return (["flashcard", "quiz", "typing", "listening"] as PlayMode[])[index % 4];
  }, [mode, index]);

  const word = words[index] ?? words[0];
  const resultAnswers = useMemo(
    () => consolidateVocabGameAnswers(answers).map(({ answer, needsReview }) => ({
      ...answer,
      correct: answer.correct && !needsReview,
    })),
    [answers],
  );

  const usesTimer = activeMode === "quiz" || activeMode === "matching";

  const makeDraftPayload = useCallback(() => {
    const payload: VocabGameDraftPayload = {
      index,
      score,
      attempts,
      answers,
      updatedAtMillis: Date.now(),
    };
    return JSON.stringify(payload);
  }, [answers, attempts, index, score]);

  const saveDraftToServer = useCallback(async (payload: string) => {
    if (!isAuthenticated) return;
    await fetch("/api/vocab/game-draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setId,
        mode,
        quizMode,
        externalPartId,
        payload,
      }),
    }).catch(() => undefined);
  }, [externalPartId, isAuthenticated, mode, quizMode, setId]);

  const applyDraft = useCallback((draft: VocabGameDraftPayload) => {
    if (!words.length || showResult) return;
    const safeIndex = Math.min(Math.max(Math.trunc(draft.index), 0), words.length - 1);
    setIndex(safeIndex);
    setScore(Math.max(0, draft.score));
    setAttempts(Math.max(0, draft.attempts));
    setCorrect(draft.answers.filter((answer) => answer.correct).length);
    setAnswers(draft.answers);
    resetCardState();
  }, [showResult, words.length]);

  useEffect(() => {
    let cancelled = false;
    const localDraft = parseGameDraft(window.localStorage.getItem(draftStorageKey));
    if (localDraft) {
      window.setTimeout(() => {
        if (!cancelled) applyDraft(localDraft);
      }, 0);
      hydratedDraftRef.current = true;
    }
    if (!isAuthenticated) {
      hydratedDraftRef.current = true;
      return () => {
        cancelled = true;
      };
    }
    const params = new URLSearchParams({
      setId: String(setId),
      mode,
      quizMode,
    });
    if (externalPartId) params.set("externalPartId", externalPartId);
    fetch(`/api/vocab/game-draft?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((result) => {
        if (cancelled || !result?.success || !result.data?.payload) return;
        const serverDraft = parseGameDraft(result.data.payload);
        if (!serverDraft) return;
        if ((serverDraft.updatedAtMillis || result.data.updatedAtMillis || 0) <= (localDraft?.updatedAtMillis ?? 0)) return;
        window.localStorage.setItem(draftStorageKey, result.data.payload);
        applyDraft(serverDraft);
        hydratedDraftRef.current = true;
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) hydratedDraftRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [applyDraft, draftStorageKey, externalPartId, isAuthenticated, mode, quizMode, setId]);

  useEffect(() => {
    if (!hydratedDraftRef.current) return;
    const payload = makeDraftPayload();
    window.localStorage.setItem(draftStorageKey, payload);
    if (showResult) return;
    if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      void saveDraftToServer(payload);
    }, 5000);
    return () => {
      if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    };
  }, [answers, attempts, draftStorageKey, index, makeDraftPayload, saveDraftToServer, score, showResult]);

  const speakItem = useCallback(
    (item?: VocabWordCard | AnswerRecord, accent: "us" | "uk" = "us") => {
      if (muted || !item) return;
      const audioUrl = audioUrlFor(item, accent);
      if (audioUrl) {
        new Audio(audioUrl).play().catch(() => {});
        return;
      }
      speak(item.word);
    },
    [muted],
  );

  const speakWord = useCallback(() => speakItem(word, "us"), [speakItem, word]);
  const speakWordUk = useCallback(() => speakItem(word, "uk"), [speakItem, word]);
  const speakExample = useCallback(() => {
    if (!muted && word?.example) speak(word.example);
  }, [muted, word]);

  /* ---- Quiz option generation ---- */
  const quizCorrect =
    quizMode === "wordMeaning" ? word?.meaning ?? "" : word?.word ?? "";
  const options = useMemo(() => {
    if (activeMode !== "quiz") return [] as string[];
    const valueOf = (w: VocabWordCard) =>
      quizMode === "wordMeaning" ? w.meaning : w.word;
    const pool = words
      .map(valueOf)
      .filter(Boolean)
      .filter((v) => v !== quizCorrect);
    return shuffle([quizCorrect, ...shuffle(pool).slice(0, 3)]).slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, quizMode, index, words]);

  /* ---- Matching board ---- */
  useEffect(() => {
    if (activeMode !== "matching") return;
    const timer = window.setTimeout(() => {
      const chosen = shuffle(words).slice(0, Math.min(8, words.length));
      const items: MatchItem[] = chosen.map((w) => ({
        id: w.id,
        word: w.word,
        meaning: w.meaning,
      }));
      setMatchWords(items);
      setMatchMeanings(shuffle(items));
      setMatchedIds([]);
      setLives(5);
      setSelWord(null);
      setSelMeaning(null);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode]);

  /* ---- Timer ---- */
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setTimer(30);
    timerRef.current = window.setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          stopTimer();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, [stopTimer]);

  // Start / restart timer per question for timed modes.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (usesTimer && !feedback && !showResult) startTimer();
      else stopTimer();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      stopTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, activeMode, feedback, showResult]);

  // Auto-speak on entering a listening card.
  useEffect(() => {
    if (activeMode === "listening") {
      const t = window.setTimeout(speakWord, 250);
      return () => window.clearTimeout(t);
    }
  }, [activeMode, index, speakWord]);

  // Handle timeout for quiz/matching.
  useEffect(() => {
    if (timer !== 0 || feedback || showResult || !usesTimer) return;
    const timeoutHandler = window.setTimeout(() => {
      if (activeMode === "quiz") {
        pushAnswer(word, false, "Hết giờ", quizCorrect);
        setStatus({ text: `Hết giờ. Đáp án đúng: ${quizCorrect}`, tone: "wrong" });
        setFeedback({ correct: false, selected: "Hết giờ", expected: quizCorrect, item: word });
      } else if (activeMode === "matching") {
        matchWords
          .filter((m) => !matchedIds.includes(m.id))
          .forEach((m) => pushAnswer({ ...m } as VocabWordCard, false, "Hết giờ", m.meaning));
        finishToResult();
      }
    }, 0);
    return () => window.clearTimeout(timeoutHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer]);

  /* ---- Answer bookkeeping ---- */
  function pushAnswer(
    item: VocabWordCard,
    isCorrect: boolean,
    sel: string,
    expected: string,
  ) {
    setAnswers((prev) => [
      ...prev,
      {
        id: item.id,
        word: item.word,
        meaning: item.meaning,
        partOfSpeech: item.partOfSpeech,
        phonetic: item.phonetic,
        phoneticUs: item.phoneticUs,
        phoneticUk: item.phoneticUk,
        example: item.example,
        audioUrl: item.audioUrl,
        audioUsUrl: item.audioUsUrl,
        audioUkUrl: item.audioUkUrl,
        correct: isCorrect,
        selected: sel,
        expected,
        mode: modeLabelFor(mode, quizMode),
      },
    ]);
    setAttempts((a) => a + 1);
    if (isCorrect) setCorrect((c) => c + 1);
  }

  /* ---- Navigation ---- */
  function resetCardState() {
    setFlipped(false);
    setTyped("");
    setHintRevealed([]);
    setStatus({ text: "", tone: "" });
    setSelected("");
    setFeedback(null);
  }

  function goNext() {
    setFeedback(null);
    if (index >= words.length - 1) {
      finishToResult();
      return;
    }
    setIndex((i) => i + 1);
    resetCardState();
  }

  function goPrev() {
    setIndex((i) => Math.max(0, i - 1));
    resetCardState();
  }

  function restart() {
    startedAtRef.current = Date.now();
    setIndex(0);
    resetCardState();
    setScore(0);
    setCorrect(0);
    setAttempts(0);
    setAnswers([]);
    setShowResult(false);
    setSaveError("");
    reviewsSavedRef.current = false;
    if (activeMode === "matching") {
      setMatchedIds([]);
      setLives(5);
    }
  }

  function finishToResult() {
    stopTimer();
    setFeedback(null);
    setShowResult(true);
  }

  /* ---- Expected answer / hints ---- */
  function expectedAnswer(): string {
    if (activeMode === "typing") return reverse ? word.word : word.meaning;
    return reverse || activeMode === "listening" ? word.word : word.meaning;
  }

  const hintAnswer = String(expectedAnswer() || "");
  const hintableIndexes = useMemo(
    () =>
      [...hintAnswer]
        .map((char, i) => ({ char, i }))
        .filter((it) => /[\p{L}\p{N}]/u.test(it.char))
        .map((it) => it.i),
    [hintAnswer],
  );
  const maxHints = Math.min(3, hintableIndexes.length);
  const remainingHints = Math.max(0, maxHints - hintRevealed.length);

  function revealHintLetter() {
    if (!["typing", "listening"].includes(activeMode) || feedback) return;
    const available = hintableIndexes.filter((i) => !hintRevealed.includes(i));
    if (!available.length || remainingHints <= 0) return;
    const next = available[Math.floor(Math.random() * available.length)];
    setHintRevealed((prev) => [...prev, next].sort((a, b) => a - b));
  }

  /* ---- Checks ---- */
  function answerMatches(input: string, expected: string): boolean {
    const actual = normalize(input);
    const target = normalize(expected);
    return (
      !!actual &&
      (actual === target ||
        (!reverse && target.includes(actual) && actual.length >= 3))
    );
  }

  function checkTyped() {
    if (feedback) return;
    const expected = expectedAnswer();
    const ok = answerMatches(typed, expected);
    if (ok) {
      setScore((s) => s + (activeMode === "listening" ? 15 : 10));
      setStatus({ text: "Đúng rồi.", tone: "correct" });
      setFlipped(true);
    } else {
      setStatus({ text: `Sai rồi. Đáp án đúng: ${expected}`, tone: "wrong" });
    }
    pushAnswer(word, ok, typed, expected);
    setFeedback({ correct: ok, selected: typed, expected, item: word });
  }

  function markKnown(known: boolean) {
    if (feedback) return;
    if (known) {
      setScore((s) => s + 5);
      setStatus({ text: "Đã đánh dấu thuộc.", tone: "correct" });
    } else {
      setStatus({ text: "Đã đánh dấu cần ôn lại.", tone: "wrong" });
    }
    pushAnswer(word, known, known ? "Đã thuộc" : "Quên", word.meaning);
    setFeedback({
      correct: known,
      selected: known ? "Đã thuộc" : "Quên",
      expected: word.meaning,
      item: word,
    });
  }

  function checkQuiz(option: string) {
    if (selected || feedback) return;
    setSelected(option);
    const ok = option === quizCorrect;
    if (ok) {
      setScore((s) => s + (quizMode === "context" ? 12 : 10));
      setStatus({ text: "Đúng rồi.", tone: "correct" });
    } else {
      setStatus({ text: `Sai rồi. Đáp án đúng: ${quizCorrect}`, tone: "wrong" });
    }
    pushAnswer(word, ok, option, quizCorrect);
    setFeedback({ correct: ok, selected: option, expected: quizCorrect, item: word });
  }

  function continueAfterFeedback() {
    if (activeMode === "matching") {
      const done = matchedIds.length === matchWords.length || lives <= 0;
      setFeedback(null);
      if (done) finishToResult();
      return;
    }
    goNext();
  }

  /* ---- Matching selection ---- */
  function chooseMatchWord(id: number) {
    if (matchedIds.includes(id)) return;
    setSelWord(id);
    resolveMatch(id, selMeaning);
  }
  function chooseMatchMeaning(id: number) {
    if (matchedIds.includes(id)) return;
    setSelMeaning(id);
    resolveMatch(selWord, id);
  }
  function resolveMatch(w: number | null, m: number | null) {
    if (w == null || m == null) return;
    if (w === m) {
      setScore((s) => s + 10);
      const matched = matchWords.find((it) => it.id === w);
      const nextMatched = [...matchedIds, w];
      setMatchedIds(nextMatched);
      setStatus({ text: "Ghép đúng.", tone: "correct" });
      if (matched) {
        pushAnswer(matched as VocabWordCard, true, matched.word, matched.meaning);
        setFeedback({
          correct: true,
          selected: matched.word,
          expected: matched.meaning,
          item: matched as VocabWordCard,
        });
      }
      if (nextMatched.length === matchWords.length) {
        stopTimer();
        setStatus({ text: "Hoàn thành bài nối từ.", tone: "correct" });
      }
    } else {
      const selectedWord = matchWords.find((it) => it.id === w);
      const chosen = matchMeanings.find((it) => it.id === m);
      if (selectedWord) {
        pushAnswer(
          selectedWord as VocabWordCard,
          false,
          chosen?.meaning || "",
          selectedWord.meaning,
        );
        setFeedback({
          correct: false,
          selected: chosen?.meaning || "",
          expected: selectedWord.meaning,
          item: selectedWord as VocabWordCard,
        });
      }
      setLives((l) => Math.max(0, l - 1));
      setStatus({ text: "Chưa khớp, thử lại.", tone: "wrong" });
    }
    setSelWord(null);
    setSelMeaning(null);
  }

  /* ---- Save & complete ---- */
  async function saveAndComplete() {
    if (saving) return;
    if (!isAuthenticated) {
      window.localStorage.setItem(draftStorageKey, makeDraftPayload());
      setSaveError("Đăng nhập để lưu tiến độ, lịch ôn và phần thưởng của phiên học này.");
      return;
    }
    setSaving(true);
    setSaveError("");
    const outcomes = consolidateVocabGameAnswers(answers);
    if (!reviewsSavedRef.current && outcomes.length > 0) {
      const status = await submitReviewBatch(
        outcomes.map(({ answer, needsReview }) => needsReview
          ? { wordId: answer.id, quality: 2 }
          : { wordId: answer.id, mastered: true }),
      );
      if (status !== 200 && status !== 204) {
        setSaving(false);
        setSaveError(
          status === 401
            ? "Bạn cần đăng nhập để lưu tiến độ học."
            : "Chưa lưu được tiến độ. Kiểm tra kết nối rồi thử lại.",
        );
        return;
      }
      reviewsSavedRef.current = true;
    }
    const answered = outcomes.length || attempts;
    const correctWords = resultAnswers.filter((answer) => answer.correct).length;
    const wrongWords = resultAnswers.length - correctWords;
    const accuracy = answered
      ? Math.round((correctWords / answered) * 100)
      : 0;
    const modeLabel = modeLabelFor(mode, quizMode);
    const historyPayload = {
      setId,
      externalTestId,
      externalPartId,
      title,
      mode: modeLabel,
      startedAtMillis: startedAtRef.current,
      totalWords: Math.max(words.length, answered),
      correctWords,
      wrongWords,
      accuracy,
      score,
    };
    const historyRes = await fetch("/api/vocab/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(historyPayload),
    });
    if (!historyRes.ok) {
      setSaving(false);
      setSaveError(
        historyRes.status === 401
          ? "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để lưu lịch sử học."
          : "Đã lưu tiến độ từ, nhưng chưa lưu được lịch sử học. Vui lòng thử lại.",
      );
      return;
    }
    window.localStorage.removeItem(draftStorageKey);
    const draftParams = new URLSearchParams({
      setId: String(setId),
      mode,
      quizMode,
    });
    if (externalPartId) draftParams.set("externalPartId", externalPartId);
    await fetch(`/api/vocab/game-draft?${draftParams.toString()}`, { method: "DELETE" }).catch(() => undefined);
    onFinish({
      mode: modeLabel,
      accuracy,
      score,
      startedAtMillis: startedAtRef.current,
      totalWords: historyPayload.totalWords,
      correctWords,
      wrongWords,
    });
  }

  /* ---- Keyboard shortcuts ---- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const editable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (editable && !(e.ctrlKey || e.metaKey)) return;

      if (
        (e.ctrlKey || e.metaKey) &&
        e.code === "Space" &&
        ["typing", "listening"].includes(activeMode)
      ) {
        e.preventDefault();
        revealHintLetter();
        return;
      }
      if (feedback) {
        if (e.key === "Enter" || e.key === "ArrowRight" || e.code === "Space") {
          e.preventDefault();
          continueAfterFeedback();
        }
        return;
      }
      if (
        e.code === "Space" &&
        ["flashcard", "typing", "listening"].includes(activeMode)
      ) {
        e.preventDefault();
        if (activeMode === "listening") speakWord();
        else setFlipped((f) => !f);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        speakWord();
      }
      if (activeMode === "quiz" && ["1", "2", "3", "4"].includes(e.key)) {
        const opt = options[Number(e.key) - 1];
        if (opt) checkQuiz(opt);
      }
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, feedback, options, index, typed]);

  if (showResult) {
    return (
      <ResultScreen
        answers={resultAnswers}
        attempts={attempts}
        score={score}
        saving={saving}
        saveError={saveError}
        muted={muted}
        isAuthenticated={isAuthenticated}
        loginHref={loginHref}
        onSave={saveAndComplete}
        onSpeak={(id) => {
          const item = resultAnswers.find((answer) => answer.id === id) || words.find((w) => w.id === id);
          if (item) speakItem(item as VocabWordCard);
        }}
      />
    );
  }

  const progressPercent =
    activeMode === "matching"
      ? matchWords.length
        ? (matchedIds.length / matchWords.length) * 100
        : 0
      : words.length
        ? ((index + 1) / words.length) * 100
        : 0;

  const statusToneClass =
    status.tone === "correct"
      ? "text-green-500"
      : status.tone === "wrong"
        ? "text-red-500"
        : "text-muted";

  return (
    <article className="flashcard-play space-y-4">
      {/* Play header */}
      <section className="flashcard-play-header mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
        <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-600">
          ~<b>{score}</b> GAME
        </span>
        <strong className="text-sm text-ink">
          {activeMode === "matching"
            ? `Đã ghép ${matchedIds.length} / ${matchWords.length}`
            : `Câu ${index + 1} / ${words.length}`}
        </strong>
        {(activeMode === "flashcard" || activeMode === "typing") && (
          <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-ink2">
            <span>{reverse ? "VN→EN" : "EN→VN"}</span>
            <input
              type="checkbox"
              checked={reverse}
              onChange={(e) => setReverse(e.target.checked)}
            />
          </label>
        )}
        <button
          type="button"
          onClick={restart}
          className="rounded-lg bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink2 hover:bg-surface-soft/70"
        >
          ↻ Chơi lại
        </button>
        <button
          type="button"
          onClick={onExit}
          className="rounded-lg bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink2 hover:bg-surface-soft/70"
        >
          Thoát
        </button>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
          <div
            className="h-full origin-left rounded-full bg-accent transition-transform duration-150 motion-reduce:transition-none"
            style={{ transform: `scaleX(${progressPercent / 100})` }}
          />
        </div>
        {usesTimer && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-soft">
            <div
              className="h-full origin-left rounded-full bg-amber-400 transition-transform duration-150 motion-reduce:transition-none"
              style={{ transform: `scaleX(${timer / 30})` }}
            />
          </div>
        )}
      </section>

      {/* Body per mode */}
      {activeMode === "flashcard" && (
        <FlashcardBody
          word={word}
          reverse={reverse}
          flipped={flipped}
          onFlip={() => setFlipped((f) => !f)}
          onSpeakWord={speakWord}
          onSpeakWordUk={speakWordUk}
          onSpeakExample={speakExample}
        />
      )}
      {activeMode === "quiz" && (
        <QuizBody
          word={word}
          quizMode={quizMode}
          options={options}
          selected={selected}
          correctAnswer={quizCorrect}
          index={index}
          total={words.length}
          score={score}
          timer={timer}
          onSpeakWord={speakWord}
          onSpeakWordUk={speakWordUk}
          onSpeakExample={speakExample}
          onAnswer={checkQuiz}
        />
      )}
      {activeMode === "matching" && (
        <MatchingBody
          words={matchWords}
          meanings={matchMeanings}
          matchedIds={matchedIds}
          selWord={selWord}
          selMeaning={selMeaning}
          lives={lives}
          timer={timer}
          onWord={chooseMatchWord}
          onMeaning={chooseMatchMeaning}
        />
      )}
      {activeMode === "typing" && (
        <TypingBody
          word={word}
          reverse={reverse}
          typed={typed}
          onType={setTyped}
          flipped={flipped}
          onToggleExample={() => setFlipped((f) => !f)}
          hintAnswer={hintAnswer}
          hintRevealed={hintRevealed}
          remainingHints={remainingHints}
          onHint={revealHintLetter}
          onSpeakWord={speakWord}
          onSubmit={checkTyped}
        />
      )}
      {activeMode === "listening" && (
        <ListeningBody
          word={word}
          reverse={reverse}
          typed={typed}
          onType={setTyped}
          flipped={flipped}
          onToggleExample={() => setFlipped((f) => !f)}
          hintAnswer={hintAnswer}
          hintRevealed={hintRevealed}
          remainingHints={remainingHints}
          onHint={revealHintLetter}
          onSpeakWord={speakWord}
          onSubmit={checkTyped}
        />
      )}

      {status.text && !feedback && (
        <p className={`text-center text-sm font-semibold ${statusToneClass}`}>{status.text}</p>
      )}

      {activeMode === "flashcard" && (
        <form
          className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            checkTyped();
          }}
        >
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={reverse ? "Gõ từ tiếng Anh" : "Gõ nghĩa tiếng Việt"}
            disabled={!!feedback}
            className="flashcard-answer-input min-h-12 flex-1 rounded-xl border border-line bg-white px-4 text-base font-semibold text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!typed.trim() || !!feedback}
            className="flashcard-control flashcard-control--check rounded-xl bg-green-600 px-6 py-3 text-sm font-extrabold text-white disabled:opacity-50"
          >
            Check
          </button>
        </form>
      )}

      {/* Common flashcard actions */}
      {activeMode === "flashcard" && (
        <div className="flashcard-actions flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={goPrev}
            className="flashcard-control rounded-lg bg-surface-soft px-4 py-2 text-sm font-semibold text-ink2"
          >
            ‹ Trước
          </button>
          <button
            type="button"
            onClick={speakWord}
            className="flashcard-icon-control rounded-full bg-surface-soft px-3 py-2 text-sm"
          >
            ♫
          </button>
          <button
            type="button"
            onClick={() => markKnown(false)}
            className="flashcard-control flashcard-control--forgot rounded-lg bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/30"
          >
            × Quên
          </button>
          <button
            type="button"
            onClick={() => markKnown(true)}
            className="flashcard-control flashcard-control--known rounded-lg bg-green-500/20 px-4 py-2 text-sm font-semibold text-green-500 hover:bg-green-500/30"
          >
            ✓ Thuộc
          </button>
          <button
            type="button"
            onClick={goNext}
            className="flashcard-control flashcard-control--next rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Tiếp ›
          </button>
        </div>
      )}

      {/* Feedback overlay */}
      {feedback && (
        <FeedbackOverlay
          feedback={feedback}
          activeMode={activeMode}
          isMatchingDone={
            activeMode === "matching" &&
            (matchedIds.length === matchWords.length || lives <= 0)
          }
          onSpeak={() => speakItem(feedback.item)}
          onSpeakExample={() => {
            if (!muted && feedback.item.example) speak(feedback.item.example);
          }}
          onContinue={continueAfterFeedback}
        />
      )}
    </article>
  );
}

/* ================================================================== */
/*  Mode bodies                                                        */
/* ================================================================== */

/* ================================================================== */
/*  Feedback overlay + result                                          */
/* ================================================================== */

function FeedbackOverlay({
  feedback,
  activeMode,
  isMatchingDone,
  onSpeak,
  onSpeakExample,
  onContinue,
}: {
  feedback: FeedbackState;
  activeMode: PlayMode;
  isMatchingDone: boolean;
  onSpeak: () => void;
  onSpeakExample: () => void;
  onContinue: () => void;
}) {
  const item = feedback.item;
  const continueText =
    activeMode === "matching" && isMatchingDone ? "Xem kết quả" : "Tiếp tục";
  return (
    <section
      className={`flashcard-feedback w-full rounded-2xl border p-4 shadow-lg ${
        feedback.correct
          ? "border-green-200 bg-green-50"
          : "border-red-200 bg-red-50"
      }`}
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 sm:flex-row">
        <button
          type="button"
          onClick={onSpeak}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink"
        >
          ♫
        </button>
        <div className="flex-1">
          <span
            className={`text-sm font-bold ${
              feedback.correct ? "text-green-600" : "text-red-600"
            }`}
          >
            {feedback.correct ? "Đúng rồi" : "Sai rồi"}
          </span>
          <h2 className="text-base font-bold text-ink">
            Từ: {item.word}{" "}
            <small className="text-muted">({item.partOfSpeech || "other"})</small>
          </h2>
          {item.phonetic && (
            <p className="text-xs text-muted">
              /{item.phonetic.replace(/^\/+|\/+$/g, "")}/
            </p>
          )}
          <strong className="text-sm text-ink2">
            Nghĩa: {item.meaning || feedback.expected}
          </strong>
          {item.example && (
            <em className="block text-xs text-muted">Ví dụ: {item.example}</em>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onSpeakExample}
            className="rounded-lg bg-surface px-3 py-2 text-sm text-ink2"
          >
            Ⅱ
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            {continueText}
          </button>
        </div>
      </div>
    </section>
  );
}

function ResultScreen({
  answers,
  attempts,
  score,
  saving,
  saveError,
  muted,
  isAuthenticated,
  loginHref,
  onSave,
  onSpeak,
}: {
  answers: AnswerRecord[];
  attempts: number;
  score: number;
  saving: boolean;
  saveError: string;
  muted: boolean;
  isAuthenticated: boolean;
  loginHref: string;
  onSave: () => void;
  onSpeak: (id: number) => void;
}) {
  const total = Math.max(1, answers.length || attempts);
  const correctItems = answers.filter((a) => a.correct);
  const wrongItems = answers.filter((a) => !a.correct);
  const percent = Math.round((correctItems.length / total) * 100);
  const title = percent >= 80 ? "Tốt lắm!" : percent >= 50 ? "Khá ổn!" : "Cố gắng!";

  const resultTone =
    percent >= 80
      ? "border-emerald-200 bg-emerald-50"
      : percent >= 50
        ? "border-amber-200 bg-amber-50"
        : "border-rose-200 bg-rose-50";
  const resultTextTone =
    percent >= 80 ? "text-emerald-700" : percent >= 50 ? "text-amber-700" : "text-rose-700";

  return (
    <section className="space-y-5">
      <article className={`flex flex-col items-center gap-4 rounded-2xl border p-6 shadow-sm sm:flex-row ${resultTone}`}>
        <div className={`text-5xl font-extrabold ${resultTextTone}`}>{percent}%</div>
        <div className="flex-1 text-center sm:text-left">
          <h2 className="text-xl font-bold text-ink">💪 {title}</h2>
          <p className="text-sm text-muted">
            ✓ {correctItems.length} đúng &nbsp; ✗ {wrongItems.length} sai &nbsp; 🎯{" "}
            {score} điểm
          </p>
        </div>
        <aside className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3 text-center">
          <strong className="block text-xs text-amber-600">🪙 Dự kiến</strong>
          <p className="text-[10px] text-muted">Số dư coin nếu lưu ngay</p>
          <b className="text-lg text-amber-600">~ +{score}</b>
        </aside>
      </article>

      <div className="grid gap-4 md:grid-cols-2">
        <ResultColumn
          tone="correct"
          icon="✓"
          title={`Trả lời đúng (${correctItems.length})`}
          subtitle="Chọn từ đánh dấu &quot;Đã thuộc&quot;"
          items={correctItems}
          onSpeak={onSpeak}
          muted={muted}
        />
        <ResultColumn
          tone="wrong"
          icon="✗"
          title={`Trả lời sai (${wrongItems.length})`}
          subtitle="Cần ôn lại"
          items={wrongItems}
          onSpeak={onSpeak}
          muted={muted}
        />
      </div>

      {isAuthenticated ? (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? "Đang lưu..." : "✓ 💾 Lưu & Hoàn thành"}
        </button>
      ) : (
        <Link
          href={loginHref}
          className="block w-full rounded-xl bg-primary py-3 text-center text-sm font-extrabold text-gold-ink hover:opacity-90"
        >
          Đăng nhập để lưu kết quả
        </Link>
      )}
      {saveError && <p className="text-center text-sm text-red-500">{saveError}</p>}
    </section>
  );
}

function ResultColumn({
  tone,
  icon,
  title,
  subtitle,
  items,
  onSpeak,
}: {
  tone: "correct" | "wrong";
  icon: string;
  title: string;
  subtitle: string;
  items: AnswerRecord[];
  onSpeak: (id: number) => void;
  muted: boolean;
}) {
  return (
    <section
      className={`space-y-3 rounded-2xl border p-4 ${
        tone === "correct"
          ? "border-emerald-300 bg-emerald-50/80"
          : "border-rose-300 bg-rose-50/80"
      }`}
    >
      <header className="flex items-center gap-3">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${
            tone === "correct" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </header>
      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_1fr] gap-2 border-b border-line pb-1 text-[10px] font-bold uppercase text-muted">
          <b>Từ vựng</b>
          <b>Nghĩa</b>
        </div>
        {items.length ? (
          items.map((item, i) => (
            <article
              key={`${item.id}-${i}`}
              className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 py-1 text-sm"
            >
              <span className={tone === "correct" ? "text-green-500" : "text-red-500"}>
                {item.correct ? "✓" : "✗"}
              </span>
              <strong className="text-ink">{item.word}</strong>
              <button
                type="button"
                onClick={() => onSpeak(item.id)}
                className="text-accent"
              >
                ♫
              </button>
              <p className="truncate text-muted">{item.meaning || item.expected}</p>
            </article>
          ))
        ) : (
          <p className="py-2 text-xs text-muted">Không có từ nào.</p>
        )}
      </div>
    </section>
  );
}

/* ================================================================== */

function isPlayMode(value: string): value is PlayMode {
  return ["flashcard", "quiz", "matching", "typing", "listening", "mixed"].includes(
    value,
  );
}
