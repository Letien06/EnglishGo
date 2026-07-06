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

interface Props {
  session: VocabSetSession;
  initialMode: string;
  practiceOptions: VocabSetCard[];
  reviewMode: boolean;
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

async function submitReview(wordId: number, quality: number): Promise<number> {
  try {
    const res = await fetch(`/api/vocab/words/${wordId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quality }),
    });
    return res.status;
  } catch {
    return 0;
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
          onExit={goHub}
          onFinish={(record) => {
            recordHistory(record);
            setScreen("hub");
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
              className={`relative flex min-h-[170px] flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${tone.card}`}
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
          className="shrink-0 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
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
      <div className="absolute inset-0" onClick={onClose} />
      <article className="relative w-full max-w-md space-y-3 rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-xl text-muted hover:text-ink"
        >
          ×
        </button>
        <h2 className="text-lg font-bold text-ink">Chọn chế độ Quiz</h2>
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
      </article>
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

  const activeMode: PlayMode = useMemo(() => {
    if (mode !== "mixed") return mode;
    return (["flashcard", "quiz", "typing", "listening"] as PlayMode[])[index % 4];
  }, [mode, index]);

  const word = words[index] ?? words[0];

  const usesTimer = activeMode === "quiz" || activeMode === "matching";

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
    setSaving(true);
    setSaveError("");
    const latest = [
      ...new Map(
        answers.filter((a) => a && a.id).map((a) => [a.id, a]),
      ).values(),
    ];
    const statuses = await Promise.all(
      latest.map((a) => submitReview(a.id, a.correct ? 5 : 2)),
    );
    const failures = statuses.filter((s) => s && s !== 200 && s !== 204);
    if (failures.length) {
      setSaving(false);
      setSaveError(
        failures.includes(401)
          ? "Bạn cần đăng nhập để lưu tiến độ học."
          : "Chưa lưu được kết quả. Vui lòng thử lại.",
      );
      return;
    }
    const answered = answers.length || attempts;
    const correctWords = answers.filter((a) => a.correct).length;
    const wrongWords = answers.filter((a) => !a.correct).length;
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
    if (!historyRes.ok && historyRes.status !== 401) {
      setSaving(false);
      setSaveError("Đã lưu tiến độ từ, nhưng chưa lưu được lịch sử học. Vui lòng thử lại.");
      return;
    }
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
        answers={answers}
        attempts={attempts}
        score={score}
        saving={saving}
        saveError={saveError}
        muted={muted}
        onSave={saveAndComplete}
        onSpeak={(id) => {
          const item =
            answers.find((a) => a.id === id) || words.find((w) => w.id === id);
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
    <article className="space-y-4">
      {/* Play header */}
      <section className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
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
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {usesTimer && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-soft">
            <div
              className="h-full rounded-full bg-amber-400 transition-all"
              style={{ width: `${(timer / 30) * 100}%` }}
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
      {(activeMode === "typing" || activeMode === "listening") && (
        <TypingBody
          word={word}
          reverse={reverse}
          listening={activeMode === "listening"}
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

      {status.text && (
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
            className="min-h-12 flex-1 rounded-xl border border-line bg-white px-4 text-base font-semibold text-ink outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!typed.trim() || !!feedback}
            className="rounded-xl bg-green-600 px-6 py-3 text-sm font-extrabold text-white disabled:opacity-50"
          >
            Check
          </button>
        </form>
      )}

      {/* Common flashcard actions */}
      {activeMode === "flashcard" && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={goPrev}
            className="rounded-lg bg-surface-soft px-4 py-2 text-sm font-semibold text-ink2"
          >
            ‹ Trước
          </button>
          <button
            type="button"
            onClick={speakWord}
            className="rounded-full bg-surface-soft px-3 py-2 text-sm"
          >
            ♫
          </button>
          <button
            type="button"
            onClick={() => markKnown(false)}
            className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/30"
          >
            × Quên
          </button>
          <button
            type="button"
            onClick={() => markKnown(true)}
            className="rounded-lg bg-green-500/20 px-4 py-2 text-sm font-semibold text-green-500 hover:bg-green-500/30"
          >
            ✓ Thuộc
          </button>
          <button
            type="button"
            onClick={goNext}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
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

function FlashcardBody({
  word,
  reverse,
  flipped,
  onFlip,
  onSpeakWord,
  onSpeakWordUk,
  onSpeakExample,
}: {
  word: VocabWordCard;
  reverse: boolean;
  flipped: boolean;
  onFlip: () => void;
  onSpeakWord: () => void;
  onSpeakWordUk: () => void;
  onSpeakExample: () => void;
}) {
  const frontTitle = reverse ? "NGHĨA TIẾNG VIỆT" : "TỪ TIẾNG ANH";
  const frontMain = reverse ? word.meaning : word.word;
  const backTitle = reverse ? "TỪ TIẾNG ANH" : "NGHĨA TIẾNG VIỆT";
  const backMain = reverse ? word.word : word.meaning;
  return (
    <div
      onClick={onFlip}
      className="mx-auto flex min-h-[360px] max-w-2xl cursor-pointer flex-col items-center justify-center rounded-2xl border border-line bg-white p-10 text-center shadow-lg transition-transform hover:-translate-y-0.5"
    >
      {!flipped ? (
        <>
          <small className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
            {frontTitle}
          </small>
          <strong className="my-3 text-4xl font-extrabold text-ink">
            {frontMain}
          </strong>
          <span className="rounded bg-surface-soft px-2 py-0.5 text-xs text-muted">
            {word.partOfSpeech || "OTHER"}
          </span>
          {!reverse && word.phonetic && (
            <em className="mt-1 text-sm text-muted">{word.phonetic}</em>
          )}
          {!reverse && (word.phoneticUs || word.phoneticUk) && (
            <div className="mt-2 flex flex-wrap justify-center gap-2 text-sm font-semibold text-muted">
              {word.phoneticUs && <span>US {word.phoneticUs}</span>}
              {word.phoneticUk && <span>UK {word.phoneticUk}</span>}
            </div>
          )}
          <div className="mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSpeakWord();
              }}
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white"
            >
              US
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSpeakWordUk();
              }}
              className="rounded-full bg-surface-soft px-3 py-1.5 text-xs font-bold text-ink2"
            >
              UK
            </button>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSpeakWord();
            }}
            className="mt-3 text-accent"
          >
            ♫ Nghe từ
          </button>
          <p className="mt-3 text-xs text-muted">Nhấn Space hoặc click để lật</p>
        </>
      ) : (
        <>
          <small className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
            {backTitle}
          </small>
          <strong className="my-3 text-3xl font-extrabold text-ink">
            {backMain}
          </strong>
          <span className="rounded bg-surface-soft px-2 py-0.5 text-xs text-muted">
            {word.partOfSpeech || "OTHER"}
          </span>
          {word.example && (
            <em className="mt-2 text-sm text-muted">Ví dụ: {word.example}</em>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSpeakExample();
            }}
            className="mt-3 text-accent"
          >
            ♫ Nghe câu ví dụ
          </button>
          <p className="mt-3 text-xs text-muted">Nhấn Space hoặc click để lật lại</p>
        </>
      )}
    </div>
  );
}

function QuizBody({
  word,
  quizMode,
  options,
  selected,
  correctAnswer,
  index,
  total,
  score,
  timer,
  onSpeakWord,
  onSpeakWordUk,
  onSpeakExample,
  onAnswer,
}: {
  word: VocabWordCard;
  quizMode: QuizMode;
  options: string[];
  selected: string;
  correctAnswer: string;
  index: number;
  total: number;
  score: number;
  timer: number;
  onSpeakWord: () => void;
  onSpeakWordUk: () => void;
  onSpeakExample: () => void;
  onAnswer: (option: string) => void;
}) {
  const contextSentence = useMemo(() => {
    const example =
      word.example || `We verified the ${word.word} before publishing.`;
    return example.replace(
      new RegExp(word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"),
      "____",
    );
  }, [word]);

  function optionClass(opt: string): string {
    if (!selected) return "border-line hover:border-accent/50";
    if (opt === correctAnswer) return "border-green-500 bg-green-500/10";
    if (opt === selected) return "border-red-500 bg-red-500/10";
    return "border-line opacity-60";
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <header className="flex items-center justify-between">
        <strong className="text-sm text-ink">
          Câu {index + 1} / {total}
        </strong>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-bold text-amber-600">
            ~<b>{score}</b> GAME
          </span>
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-xs text-ink2">
            {timer}s
          </span>
        </div>
      </header>

      {quizMode === "context" ? (
        <div className="space-y-2 text-center">
          <span className="text-[10px] uppercase tracking-widest text-muted">
            NGỮ CẢNH · CHỌN ĐÁP ÁN
          </span>
          <p className="text-lg text-ink">{contextSentence}</p>
          <button type="button" onClick={onSpeakExample} className="text-accent text-sm">
            Dịch câu / nghe
          </button>
        </div>
      ) : quizMode === "meaningWord" ? (
        <div className="flex items-center justify-center gap-2 text-center">
          <h2 className="text-2xl font-bold text-ink">{word.meaning}</h2>
          <button type="button" onClick={onSpeakWord} className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-white">
            US
          </button>
          <button type="button" onClick={onSpeakWordUk} className="rounded-full bg-surface-soft px-3 py-1 text-xs font-bold text-ink2">
            UK
          </button>
          <button type="button" onClick={onSpeakWord} className="text-accent">
            ♫
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2 text-center">
          <h2 className="text-2xl font-bold text-ink">{word.word}</h2>
          <button type="button" onClick={onSpeakWord} className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-white">
            US
          </button>
          <button type="button" onClick={onSpeakWordUk} className="rounded-full bg-surface-soft px-3 py-1 text-xs font-bold text-ink2">
            UK
          </button>
          <button type="button" onClick={onSpeakWord} className="text-accent">
            ♫
          </button>
          <span className="rounded bg-surface-soft px-2 py-0.5 text-xs text-muted">
            {word.partOfSpeech || "OTHER"}
          </span>
          {word.phonetic && (
            <em className="text-sm text-muted">{word.phonetic}</em>
          )}
          {(word.phoneticUs || word.phoneticUk) && (
            <div className="basis-full text-sm text-muted">
              {word.phoneticUs && <span className="mr-3">US {word.phoneticUs}</span>}
              {word.phoneticUk && <span>UK {word.phoneticUk}</span>}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((opt, i) => (
          <button
            key={`${opt}-${i}`}
            type="button"
            disabled={!!selected}
            onClick={() => onAnswer(opt)}
            className={`flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-left text-sm transition-colors ${optionClass(opt)}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-surface-soft text-xs font-bold text-ink2">
              {i + 1}
            </span>
            <b className="font-semibold text-ink">{opt}</b>
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-muted">
        Sử dụng phím số 1-4 để chọn nhanh đáp án
      </p>
    </section>
  );
}

function MatchingBody({
  words,
  meanings,
  matchedIds,
  selWord,
  selMeaning,
  lives,
  timer,
  onWord,
  onMeaning,
}: {
  words: MatchItem[];
  meanings: MatchItem[];
  matchedIds: number[];
  selWord: number | null;
  selMeaning: number | null;
  lives: number;
  timer: number;
  onWord: (id: number) => void;
  onMeaning: (id: number) => void;
}) {
  function cls(id: number, sel: number | null): string {
    const done = matchedIds.includes(id);
    if (done) return "border-green-500 bg-green-500/10 opacity-60";
    if (sel === id) return "border-accent bg-accent/10";
    return "border-line hover:border-accent/50";
  }
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <header className="flex items-center justify-between">
        <div className="text-red-500">{"❤ ".repeat(Math.max(0, lives)).trim()}</div>
        <span className="rounded-full bg-surface-soft px-2 py-0.5 text-xs text-ink2">
          {timer}s
        </span>
      </header>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted">Tiếng Anh</h3>
          {words.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={matchedIds.includes(item.id)}
              onClick={() => onWord(item.id)}
              className={`block w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink ${cls(item.id, selWord)}`}
            >
              {item.word}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted">Tiếng Việt</h3>
          {meanings.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={matchedIds.includes(item.id)}
              onClick={() => onMeaning(item.id)}
              className={`block w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink ${cls(item.id, selMeaning)}`}
            >
              {item.meaning}
            </button>
          ))}
        </div>
      </div>
      <strong className="block text-center text-sm text-ink">
        Đã ghép: {matchedIds.length} / {words.length}
      </strong>
    </section>
  );
}

function TypingBody({
  word,
  reverse,
  listening,
  typed,
  onType,
  flipped,
  onToggleExample,
  hintAnswer,
  hintRevealed,
  remainingHints,
  onHint,
  onSpeakWord,
  onSubmit,
}: {
  word: VocabWordCard;
  reverse: boolean;
  listening: boolean;
  typed: string;
  onType: (value: string) => void;
  flipped: boolean;
  onToggleExample: () => void;
  hintAnswer: string;
  hintRevealed: number[];
  remainingHints: number;
  onHint: () => void;
  onSpeakWord: () => void;
  onSubmit: () => void;
}) {
  const prompt = listening
    ? "Nghe và gõ từ tiếng Anh"
    : reverse
      ? word.meaning
      : word.word;
  const placeholder = listening
    ? "Gõ từ bạn nghe được..."
    : reverse
      ? "Gõ từ tiếng Anh..."
      : "Gõ nghĩa tiếng Việt...";

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 text-center">
      {listening ? (
        <>
          <small className="text-xs text-muted">Nghe: 2x | Ctrl+H</small>
          <button
            type="button"
            onClick={onSpeakWord}
            className="mx-auto flex h-20 w-20 flex-col items-center justify-center rounded-full bg-accent text-white"
          >
            ♫<b className="text-[10px]">CTRL + X</b>
          </button>
        </>
      ) : (
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={onSpeakWord} className="text-accent">
            ♫
          </button>
          <span className="rounded bg-surface-soft px-2 py-0.5 text-xs text-muted">
            {word.partOfSpeech || "OTHER"}
          </span>
        </div>
      )}

      <h2 className="text-xl font-bold text-ink">{prompt}</h2>
      <em className="block text-sm text-muted">
        {flipped && word.example ? word.example : "Chưa có gợi ý"}
      </em>

      {/* Letter hint */}
      {hintAnswer && (
        <div className="flex flex-wrap justify-center gap-1">
          {[...hintAnswer].map((char, i) => {
            if (/\s/u.test(char))
              return <span key={i} className="w-3" />;
            if (!/[\p{L}\p{N}]/u.test(char))
              return (
                <span key={i} className="text-muted">
                  {char}
                </span>
              );
            const visible = hintRevealed.includes(i);
            return (
              <span
                key={i}
                className={`flex h-8 w-6 items-center justify-center rounded border text-sm font-bold ${
                  visible
                    ? "border-accent text-accent"
                    : "border-line text-transparent"
                }`}
              >
                {visible ? char : "_"}
              </span>
            );
          })}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex items-center justify-center gap-2"
      >
        <input
          value={typed}
          onChange={(e) => onType(e.target.value)}
          placeholder={placeholder}
          className="w-full max-w-sm rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          autoFocus
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Kiểm tra
        </button>
      </form>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onToggleExample}
          className="rounded-lg bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink2"
        >
          Xem ví dụ
        </button>
        <button
          type="button"
          onClick={onHint}
          disabled={remainingHints <= 0}
          className="rounded-lg bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink2 disabled:opacity-40"
        >
          Gợi ý ({remainingHints})
        </button>
      </div>
    </section>
  );
}

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
      className={`fixed inset-x-0 bottom-0 z-40 border-t p-4 ${
        feedback.correct
          ? "border-green-500 bg-green-500/10"
          : "border-red-500 bg-red-500/10"
      }`}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-4">
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
  onSave,
  onSpeak,
}: {
  answers: AnswerRecord[];
  attempts: number;
  score: number;
  saving: boolean;
  saveError: string;
  muted: boolean;
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

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {saving ? "Đang lưu..." : "✓ 💾 Lưu & Hoàn thành"}
      </button>
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
