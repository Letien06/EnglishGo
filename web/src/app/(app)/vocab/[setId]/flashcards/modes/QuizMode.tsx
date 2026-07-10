import { useMemo } from "react";
import type { VocabWordCard } from "@/types/vocab";

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
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <header className="flex items-center justify-between"><strong className="text-sm text-ink">Câu {index + 1} / {total}</strong><span className="text-xs text-muted">{score} điểm · {timer}s</span></header>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-ink">{quizMode === "context" ? context : quizMode === "meaningWord" ? word.meaning : word.word}</h2>
        <div className="mt-2 flex justify-center gap-2"><button type="button" onClick={onSpeakWord} className="text-sm font-bold text-accent">US</button><button type="button" onClick={onSpeakWordUk} className="text-sm font-bold text-accent">UK</button>{quizMode === "context" && <button type="button" onClick={onSpeakExample} className="text-sm font-bold text-accent">Nghe câu</button>}</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{options.map((option, optionIndex) => <button key={`${option}-${optionIndex}`} type="button" disabled={Boolean(selected)} onClick={() => onAnswer(option)} className={`flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-left text-sm ${tone(option)}`}><span className="flex h-6 w-6 items-center justify-center rounded bg-surface-soft text-xs font-bold">{optionIndex + 1}</span><b>{option}</b></button>)}</div>
    </section>
  );
}
