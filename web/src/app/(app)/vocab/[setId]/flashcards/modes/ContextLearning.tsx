"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import { normalizeVocabularyAnswer, vocabularyStudySteps, type VocabularyStudyStep } from "@/lib/vocab-content";
import type { VocabularyRoundAnswer, VocabularyRoundResult } from "@/lib/vocab-arcade";
import { englishExampleForSpeech } from "@/lib/vocab-speech";
import useVocabularyAudio from "../useVocabularyAudio";
import styles from "../vocabulary.module.css";

interface ContextLearningProps {
  words: VocabWordCard[];
  onComplete: (result: VocabularyRoundResult) => void;
  onExit: () => void;
  onNavigateTab?: (tab: "view" | "learn" | "play") => void;
  activeTab?: "view" | "learn" | "play";
}

function FallbackIllustration({ word }: { word: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-blue-50 p-4 text-center select-none relative">
      <div className="w-24 h-24 mb-2 rounded-2xl bg-amber-100/80 border border-amber-200 flex items-center justify-center text-4xl shadow-inner">
        ☕
      </div>
      <div className="font-extrabold text-slate-700 text-sm tracking-wide capitalize">{word}</div>
      <div className="text-[10px] text-slate-400 font-medium">Flashcard minh họa</div>
      <span className="absolute bottom-2 right-2.5 text-[9px] font-black text-blue-600/80 bg-white/90 border border-blue-100 px-1.5 py-0.5 rounded shadow-sm">
        ENGLISHGO
      </span>
    </div>
  );
}

function renderHighlightedSentence(sentence: string, targetWord: string) {
  if (!sentence || !targetWord) return sentence;
  const stem = targetWord.length > 4 ? targetWord.slice(0, 4) : targetWord;
  const regex = new RegExp(`(\\b${stem}[a-z]*\\b)`, "gi");
  const parts = sentence.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <span
        key={i}
        className="text-cyan-300 underline decoration-dotted decoration-2 underline-offset-8 font-extrabold"
      >
        {part}
      </span>
    ) : (
      part
    )
  );
}

export default function ContextLearning({
  words,
  onComplete,
  onExit,
  onNavigateTab,
  activeTab = "learn",
}: ContextLearningProps) {
  const [index, setIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");
  const [forgotten, setForgotten] = useState(false);
  const [feedback, setFeedback] = useState<null | boolean>(null);
  const [answers, setAnswers] = useState<VocabularyRoundAnswer[]>([]);
  const [direction, setDirection] = useState<"en-vi" | "vi-en">("en-vi");
  const [showDetails, setShowDetails] = useState(true);
  const [skipTyping, setSkipTyping] = useState(false);
  const [masteredSet, setMasteredSet] = useState<Set<number>>(() => new Set());
  const [points, setPoints] = useState(0);
  const [reported, setReported] = useState<Set<number>>(() => new Set());
  const [reportNotice, setReportNotice] = useState<string | null>(null);

  const finished = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { speak, speakWord, stop } = useVocabularyAudio();

  const word = words[index];

  const steps = useMemo(() => {
    return word ? vocabularyStudySteps(word) : [];
  }, [word]);

  const step: VocabularyStudyStep | undefined = steps[stepIndex] || steps[0];

  // Auto-pronounce word or phrase when entering step or on demand
  const handleNextStep = useCallback(
    (next: number) => {
      stop();
      setStepIndex(next);
      setFlipped(false);
      setTyped("");
      setFeedback(null);
      setSkipTyping(false);

      const targetStep = steps[next];
      if (targetStep) {
        if (targetStep.kind === "word" && word) {
          speakWord(word, "us");
        } else if (targetStep.kind === "phrase" || targetStep.kind === "example") {
          speak(englishExampleForSpeech(targetStep.front));
        }
      }
    },
    [steps, word, speak, speakWord, stop]
  );

  const handleAdvanceWord = useCallback(
    (quality?: number, markMastered?: boolean) => {
      if (finished.current || !word) return;
      stop();

      const isCorrect = markMastered || (quality !== undefined && quality >= 3 && !forgotten);
      const nextAnswers: VocabularyRoundAnswer[] = [
        ...answers,
        {
          item: word,
          correct: isCorrect,
          selected: typed || (isCorrect ? "Đã nhớ" : "Cần ôn"),
          expected: word.word,
        },
      ];

      if (markMastered) {
        setMasteredSet((prev) => new Set(prev).add(word.id));
      }

      // Persist review to server in background if quality or mastered is specified
      if (quality !== undefined || markMastered) {
        fetch("/api/vocab/reviews/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviews: [
              markMastered
                ? { wordId: word.id, mastered: true }
                : { wordId: word.id, quality: quality ?? 4 },
            ],
          }),
        }).catch(() => {});
      }

      setPoints((prev) => prev + (isCorrect ? 10 : 2));

      if (index + 1 >= words.length) {
        finished.current = true;
        onComplete({
          answers: nextAnswers,
          score: nextAnswers.filter((a) => a.correct).length * 10,
        });
      } else {
        setAnswers(nextAnswers);
        setIndex((prev) => prev + 1);
        setForgotten(false);
        setStepIndex(0);
        setFlipped(false);
        setTyped("");
        setFeedback(null);
        setSkipTyping(false);
      }
    },
    [word, answers, forgotten, typed, index, words.length, onComplete, stop]
  );

  // Keyboard controls
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";

      if (event.code === "Space" && !isInput) {
        event.preventDefault();
        setFlipped((f) => !f);
      } else if (step?.kind === "typing" && (skipTyping || feedback !== null) && !isInput) {
        if (event.key === "1") handleAdvanceWord(1);
        else if (event.key === "2") handleAdvanceWord(2);
        else if (event.key === "3") handleAdvanceWord(4);
        else if (event.key === "4") handleAdvanceWord(5);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step?.kind, skipTyping, feedback, handleAdvanceWord]);

  if (!word || !step) {
    return (
      <section className="p-8 text-center text-white" aria-label="Học theo ngữ cảnh">
        <p className="text-xl font-bold mb-3">Chưa có từ để học.</p>
        <button className={styles.button} onClick={onExit}>
          Quay lại danh sách
        </button>
      </section>
    );
  }

  // Calculate deck progress counts
  const totalCount = words.length;
  const masteredCount = words.filter((w) => w.mastered || masteredSet.has(w.id)).length;
  const newCount = Math.max(0, totalCount - masteredCount);
  const dueCount = words.filter((w) => !w.mastered && !masteredSet.has(w.id)).length;

  const nextStep = steps[stepIndex + 1];
  const nextStepLabel = nextStep ? nextStep.label : "Hoàn thành từ";

  const handleReport = () => {
    if (reported.has(word.id)) return;
    setReported((prev) => new Set(prev).add(word.id));
    setReportNotice("Đã ghi nhận báo cáo từ vựng. Đội ngũ ENGLISHGO sẽ xem xét!");
    setTimeout(() => setReportNotice(null), 3500);
  };

  return (
    <div className={styles.dauStudyWrapper} aria-label="Học từ vựng TOEIC">
      {/* Top Header / View Navigation */}
      <div className={styles.dauTopHeader}>
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="w-9 h-9 rounded-xl bg-[#142134] border border-[#1e3048] text-slate-300 hover:text-white flex items-center justify-center font-bold transition-all"
            title="Thoát phiên học"
          >
            ←
          </button>
          <div className={styles.dauHeaderTabs} role="tablist">
            <button
              className={styles.dauHeaderTab}
              role="tab"
              aria-selected={activeTab === "view"}
              onClick={() => onNavigateTab?.("view")}
            >
              <span>👁</span>
              <span>Xem từ</span>
            </button>
            <button
              className={styles.dauHeaderTab}
              role="tab"
              aria-selected={activeTab === "learn"}
              onClick={() => onNavigateTab?.("learn")}
            >
              <span>📖</span>
              <span>Học</span>
            </button>
            <button
              className={styles.dauHeaderTab}
              role="tab"
              aria-selected={activeTab === "play"}
              onClick={() => onNavigateTab?.("play")}
            >
              <span>🎮</span>
              <span>Chơi</span>
            </button>
          </div>
        </div>

        <div className={styles.dauHeaderStats}>
          <span className={styles.dauStreakBadge}>
            <span>⚡</span>
            <span>+{points}</span>
          </span>
          <span className="font-mono font-bold text-slate-300">
            {index + 1}/{words.length} từ
          </span>
          <button
            onClick={onExit}
            className="text-xs text-slate-400 hover:text-white transition-all underline ml-2 hidden sm:inline"
          >
            Thoát phiên học
          </button>
        </div>
      </div>

      {/* Progress Bar under Header */}
      <div
        className="w-full h-1.5 bg-[#142134] rounded-full overflow-hidden"
        role="progressbar"
        aria-label="Tiến độ học"
        aria-valuemin={0}
        aria-valuemax={words.length}
        aria-valuenow={index}
      >
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-300 ease-out"
          style={{ width: `${((index + 1) / words.length) * 100}%` }}
        />
      </div>

      {/* Main Study Card Container */}
      <div className={styles.dauCardContainer}>
        {/* Card Header (Step Pills & Controls) */}
        <div className={styles.dauCardHeader}>
          {/* Step Pills */}
          <nav className={styles.dauStepPills} aria-label="Các bước của từ">
            {steps.map((item, position) => {
              const isDone = position < stepIndex;
              const isActive = position === stepIndex;
              return (
                <button
                  key={position}
                  aria-label={`${position + 1}. ${item.label}`}
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => handleNextStep(position)}
                  className={`${styles.dauStepPill} ${
                    isDone
                      ? styles.dauStepPillDone
                      : isActive
                      ? styles.dauStepPillActive
                      : styles.dauStepPillUpcoming
                  }`}
                >
                  {isDone && <span className="text-xs">✓</span>}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Card Tools */}
          <div className={styles.dauCardControls}>
            <button
              onClick={() => setDirection((d) => (d === "en-vi" ? "vi-en" : "en-vi"))}
              className={styles.dauControlBtn}
              title="Đổi chiều lật thẻ"
            >
              <span>⇆</span>
              <span>{direction === "en-vi" ? "Anh → Việt" : "Việt → Anh"}</span>
            </button>

            <button
              onClick={() => handleAdvanceWord(undefined, true)}
              className={`${styles.dauControlBtn} ${
                masteredSet.has(word.id) ? "text-emerald-400 border-emerald-500/50" : ""
              }`}
              title="Đánh dấu đã thuộc"
            >
              <span>✓</span>
            </button>

            <button
              onClick={handleReport}
              className={styles.dauControlBtn}
              title="Báo lỗi từ vựng"
            >
              <span>⚠</span>
            </button>
          </div>
        </div>

        {/* Report Alert Notice */}
        {reportNotice && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs px-4 py-2 text-center font-semibold">
            {reportNotice}
          </div>
        )}

        {/* Card Body */}
        {step.kind === "typing" ? (
          /* STEP 5: GÕ TỪ & SRS REVIEW */
          <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 text-center select-none">
            <button
              onClick={() => setSkipTyping(true)}
              className="text-xs font-bold text-slate-400 hover:text-white mb-4 underline transition-all"
            >
              Bỏ qua gõ từ
            </button>

            {!skipTyping && feedback === null ? (
              /* Typing Input Mode */
              <div className="w-full max-w-lg space-y-4">
                <span className="text-xs uppercase tracking-widest text-slate-400 font-bold">
                  Nhớ lại không nhìn đáp án
                </span>
                <h3 className="text-3xl md:text-4xl font-extrabold text-white">
                  {word.meaning}
                </h3>

                <form
                  className="flex flex-col sm:flex-row gap-3 mt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!typed.trim() || feedback !== null) return;
                    const correct =
                      normalizeVocabularyAnswer(typed) ===
                      normalizeVocabularyAnswer(word.word);
                    setFeedback(correct);
                    if (!correct) setForgotten(true);
                  }}
                >
                  <input
                    ref={inputRef}
                    autoFocus
                    className="flex-1 px-4 py-3 rounded-xl bg-[#162438] border border-[#233852] text-white text-lg font-bold placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    aria-label="Gõ từ tiếng Anh"
                    placeholder="Gõ từ tiếng Anh..."
                    value={typed}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    readOnly={feedback !== null}
                    onChange={(event) => setTyped(event.target.value)}
                  />
                  <button
                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all disabled:opacity-50"
                    disabled={!typed.trim() || feedback !== null}
                  >
                    Kiểm tra
                  </button>
                </form>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    className="text-xs font-semibold text-slate-400 hover:text-white"
                    onClick={() => {
                      setFeedback(false);
                      setForgotten(true);
                    }}
                  >
                    Chưa nhớ, xem đáp án
                  </button>
                </div>
              </div>
            ) : (
              /* Revealed Word with 4 Spaced Repetition (Anki/SM-2) Rating Buttons */
              <div className="w-full max-w-xl space-y-5 animate-[fadeIn_0.25s_ease-out]">
                {feedback !== null && (
                  <div
                    role="status"
                    className={`inline-block px-4 py-1.5 rounded-full text-xs font-bold mb-2 ${
                      feedback
                        ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                        : "bg-red-500/20 border border-red-500/40 text-red-300"
                    }`}
                  >
                    {feedback ? "Chính xác! 🎯" : `Chưa đúng. Đáp án: ${word.word}`}
                  </div>
                )}

                <div className="space-y-2">
                  <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight">
                    {word.word}{" "}
                    <span className="text-slate-400 text-xl font-medium">
                      ({word.partOfSpeech || "v"})
                    </span>
                  </h2>

                  <div className="flex items-center justify-center gap-4 text-sm font-semibold">
                    <button
                      onClick={() => speakWord(word, "us")}
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1.5"
                    >
                      <span>🔊</span>
                      <span>{word.phoneticUs || word.phonetic || "/.../"}</span>
                    </button>
                    <button
                      onClick={() => speakWord(word, "uk")}
                      className="text-red-400 hover:text-red-300 flex items-center gap-1.5"
                    >
                      <span>🔊</span>
                      <span>{word.phoneticUk || word.phonetic || "/.../"}</span>
                    </button>
                  </div>

                  <p className="text-2xl font-extrabold text-emerald-400 pt-1">
                    {word.meaning}
                  </p>
                </div>

                {feedback !== null && (
                  <div className="flex justify-center gap-2 my-2">
                    {feedback === false && (
                      <button
                        className="px-4 py-1.5 rounded-lg bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white"
                        onClick={() => {
                          setFeedback(null);
                          setTyped("");
                          inputRef.current?.focus();
                        }}
                      >
                        Gõ lại
                      </button>
                    )}
                    <button
                      className="px-5 py-2 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-500 shadow-md transition-all"
                      onClick={() => handleAdvanceWord(feedback ? 4 : 1)}
                    >
                      Từ tiếp theo →
                    </button>
                  </div>
                )}

                {/* 4 Anki/SM-2 Rating Buttons (Image 3) */}
                <div className="pt-4">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-bold block mb-3">
                    Đánh giá mức độ ghi nhớ (Phím 1-4)
                  </span>
                  <div className={styles.dauSrsGrid}>
                    <button
                      onClick={() => handleAdvanceWord(1)}
                      className={`${styles.dauSrsBtn} ${styles.dauSrsAgain}`}
                    >
                      <span>Học lại</span>
                      <small>1m</small>
                    </button>
                    <button
                      onClick={() => handleAdvanceWord(2)}
                      className={`${styles.dauSrsBtn} ${styles.dauSrsHard}`}
                    >
                      <span>Khó</span>
                      <small>12h</small>
                    </button>
                    <button
                      onClick={() => handleAdvanceWord(4)}
                      className={`${styles.dauSrsBtn} ${styles.dauSrsGood}`}
                    >
                      <span>Tốt</span>
                      <small>18h</small>
                    </button>
                    <button
                      onClick={() => handleAdvanceWord(5)}
                      className={`${styles.dauSrsBtn} ${styles.dauSrsEasy}`}
                    >
                      <span>Dễ</span>
                      <small>1d</small>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* STEPS 1-4: TỪ, CỤM, CÂU */
          <div
            className={styles.dauCardContent}
            onClick={() => setFlipped(!flipped)}
            role="button"
            tabIndex={0}
            aria-label="Lật thẻ học"
            aria-pressed={flipped}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setFlipped(!flipped);
              }
            }}
          >
            {step.kind === "word" ? (
              /* STEP 1: TỪ (Word) */
              !flipped ? (
                /* Front of Word */
                <div className="flex flex-col items-center justify-center space-y-4 animate-[fadeIn_0.2s_ease-out]">
                  <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight">
                    {direction === "en-vi" ? word.word : word.meaning}{" "}
                    {word.partOfSpeech && (
                      <span className="text-slate-400 text-xl font-normal">
                        ({word.partOfSpeech})
                      </span>
                    )}
                  </h2>

                  <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-semibold">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakWord(word, "us");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all"
                    >
                      <span>🔊</span>
                      <span>{word.phoneticUs || word.phonetic || "/.../"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakWord(word, "uk");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
                    >
                      <span>🔊</span>
                      <span>{word.phoneticUk || word.phonetic || "/.../"}</span>
                    </button>
                  </div>

                  <span className="text-xs text-slate-400 font-semibold pt-4">
                    Nhấn để xem nghĩa
                  </span>
                </div>
              ) : (
                /* Back of Word (Image 2) */
                <div
                  className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center text-left animate-[fadeIn_0.2s_ease-out]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Left Column: Illustration */}
                  <div className="flex justify-center">
                    <div className={styles.dauIllustrationBox}>
                      {word.imageUrl ? (
                        <img
                          src={word.imageUrl}
                          alt={word.word}
                          className="w-full h-full object-contain p-2"
                        />
                      ) : (
                        <FallbackIllustration word={word.word} />
                      )}
                    </div>
                  </div>

                  {/* Right Column: Word Meaning & Details */}
                  <div className="flex flex-col justify-center space-y-3">
                    <div className="flex items-center gap-2">
                      {word.partOfSpeech && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 uppercase">
                          {word.partOfSpeech}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => speakWord(word, "us")}
                        className="text-blue-400 hover:text-blue-300 text-xs font-bold flex items-center gap-1"
                      >
                        <span>🔊</span>
                        <span>{word.word}</span>
                      </button>
                    </div>

                    <h3 className="text-3xl md:text-4xl font-extrabold text-white">
                      {word.meaning}
                    </h3>

                    <button
                      type="button"
                      onClick={() => setShowDetails(!showDetails)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-semibold"
                    >
                      <span>{showDetails ? "Ẩn chi tiết ^" : "Hiện chi tiết v"}</span>
                    </button>

                    {showDetails && (
                      <div className="space-y-3 pt-1">
                        {/* Synonyms */}
                        {word.synonyms && word.synonyms.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-400 font-medium">
                              Đồng nghĩa
                            </span>
                            {word.synonyms.map((s, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-0.5 rounded-full bg-blue-950/80 border border-blue-500/30 text-blue-300 text-xs font-semibold"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Example sentence */}
                        {word.example && (
                          <div className="bg-[#142236] border border-[#203450] rounded-xl p-3.5 space-y-1">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                              Ví dụ
                            </span>
                            <p className="text-sm font-semibold text-slate-100">
                              {renderHighlightedSentence(word.example, word.word)}
                            </p>
                            {word.exampleTranslation && (
                              <p className="text-xs text-slate-400">
                                {word.exampleTranslation}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            ) : step.kind === "phrase" ? (
              /* STEP 2-3: CỤM (Collocation / Phrase - Image 4) */
              <div className="flex flex-col items-center justify-center space-y-4 animate-[fadeIn_0.2s_ease-out]">
                <h3 className="text-3xl md:text-4xl font-extrabold text-white max-w-xl leading-relaxed">
                  {flipped ? step.back : step.front}
                </h3>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speak(englishExampleForSpeech(step.front));
                  }}
                  className="w-12 h-12 rounded-full bg-[#18263a] border border-[#233752] hover:bg-blue-600 hover:border-blue-500 text-white flex items-center justify-center text-lg my-2 shadow-lg transition-all"
                  title="Nghe phát âm"
                >
                  🔊
                </button>

                <span className="text-xs text-slate-400 font-semibold">
                  {flipped
                    ? `Nghĩa: ${step.back}`
                    : "Bấm vào từng từ để xem nghĩa · Nhấn thẻ để xem nghĩa"}
                </span>
              </div>
            ) : (
              /* STEP 4: CÂU (Example Sentence - Image 5) */
              <div className="flex flex-col items-center justify-center space-y-4 animate-[fadeIn_0.2s_ease-out]">
                <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white max-w-2xl leading-relaxed">
                  {flipped
                    ? step.back
                    : renderHighlightedSentence(step.front, word.word)}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speak(englishExampleForSpeech(step.front));
                  }}
                  className="w-12 h-12 rounded-full bg-[#18263a] border border-[#233752] hover:bg-blue-600 hover:border-blue-500 text-white flex items-center justify-center text-lg my-2 shadow-lg transition-all"
                  title="Nghe phát âm"
                >
                  🔊
                </button>

                <span className="text-xs text-slate-400 font-semibold">
                  {flipped
                    ? `Bản dịch: ${step.back}`
                    : "Bấm vào từng từ để xem nghĩa · Nhấn thẻ để xem bản dịch"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Row Under Card (When Flipped on non-typing steps) */}
      {step.kind !== "typing" && flipped && (
        <div className={styles.dauActionRow}>
          <button
            onClick={() => handleAdvanceWord(undefined, true)}
            className={styles.dauMasteredBtn}
          >
            <span>✓</span>
            <span>Đã thuộc</span>
          </button>
          <button
            onClick={() => handleNextStep(Math.min(stepIndex + 1, steps.length - 1))}
            className={styles.dauNextStepBtn}
          >
            <span>Chưa nhớ · {nextStepLabel}</span>
          </button>
        </div>
      )}

      {/* Bottom Footer (Shortcut & Stats Bar) */}
      <div className={styles.dauBottomFooter}>
        <span className={styles.dauSpaceHint}>Space: lật thẻ</span>
        <div className={styles.dauStatsBar}>
          <span className="text-blue-400">
            <strong>{newCount}</strong> Từ mới
          </span>
          <span className="text-emerald-400">
            <strong>{masteredCount}</strong> Đã học
          </span>
          <span className="text-amber-400">
            <strong>{dueCount}</strong> Ôn tập
          </span>
        </div>
      </div>
    </div>
  );
}
