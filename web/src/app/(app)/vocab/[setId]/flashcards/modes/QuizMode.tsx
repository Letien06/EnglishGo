import { useMemo } from "react";
import type { VocabWordCard } from "@/types/vocab";
import styles from "../vocabulary.module.css";

type QuizMode = "wordMeaning" | "context" | "meaningWord";

export default function QuizModeBody({ word, quizMode, options, selected, correctAnswer, index, total, score, timer, onSpeakWord, onSpeakWordUk, onSpeakExample, onAnswer }: {
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
  const context = useMemo(() => (word.example || `We verified the ${word.word} before publishing.`).replace(new RegExp(word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "____"), [word]);
  const tone = (option: string) => !selected ? "border-line hover:border-accent/50" : option === correctAnswer ? "border-green-500 bg-green-500/10" : option === selected ? "border-red-500 bg-red-500/10" : "border-line opacity-60";
  return (
    <section className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-line bg-surface p-5 sm:p-8">
      <header className="flex items-center justify-between"><strong className="text-sm text-ink">Câu {index + 1} / {total}</strong><span className="text-xs text-muted">{score} điểm · {timer}s</span></header>
      <div className="py-4 text-center">
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">{quizMode === "meaningWord" ? "Chọn từ tiếng Anh" : "Chọn nghĩa đúng"}</p>
        <h2 className="break-words text-3xl font-bold text-ink sm:text-4xl">{quizMode === "context" ? context : quizMode === "meaningWord" ? word.meaning : word.word}</h2>
        <div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={onSpeakWord} className={styles.button}>♫ US {word.phoneticUs || word.phonetic}</button><button type="button" onClick={onSpeakWordUk} className={styles.button}>♫ UK {word.phoneticUk || word.phonetic}</button>{quizMode === "context" && <button type="button" onClick={onSpeakExample} className={styles.button}>Nghe câu</button>}</div>
      </div>
      <div className="grid gap-3">{options.map((option, optionIndex) => <button key={`${option}-${optionIndex}`} type="button" disabled={Boolean(selected)} onClick={() => onAnswer(option)} className={`flex min-h-14 items-center gap-4 rounded-xl border bg-surface px-4 py-3 text-left text-sm text-ink ${tone(option)}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-xs font-bold">{optionIndex + 1}</span><b>{option}</b></button>)}</div>
      <p className="text-center text-xs text-muted">Bấm phím 1–4 để chọn đáp án</p>
    </section>
  );
}
