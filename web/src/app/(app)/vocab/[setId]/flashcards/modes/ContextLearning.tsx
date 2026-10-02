"use client";

import { useRef, useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import { normalizeVocabularyAnswer, vocabularyStudySteps } from "@/lib/vocab-content";
import type { VocabularyRoundAnswer, VocabularyRoundResult } from "@/lib/vocab-arcade";
import { englishExampleForSpeech } from "@/lib/vocab-speech";
import useVocabularyAudio from "../useVocabularyAudio";
import styles from "../vocabulary.module.css";

export default function ContextLearning({ words, onComplete, onExit }: {
  words: VocabWordCard[];
  onComplete: (result: VocabularyRoundResult) => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");
  const [forgotten, setForgotten] = useState(false);
  const [feedback, setFeedback] = useState<null | boolean>(null);
  const [answers, setAnswers] = useState<VocabularyRoundAnswer[]>([]);
  const finished = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const { speak, stop } = useVocabularyAudio();
  const word = words[index];
  if (!word) return <p className={styles.details}>Chưa có từ để học.</p>;
  const steps = vocabularyStudySteps(word);
  const step = steps[stepIndex];

  function nextStep(next: number) { stop(); setStepIndex(next); setFlipped(false); setTyped(""); setFeedback(null); }
  function nextWord(correct: boolean) {
    if (finished.current) return;
    const next = [...answers, { item: word, correct: correct && !forgotten, selected: typed || (correct ? "Đã nhớ" : "Cần ôn"), expected: word.word }];
    stop();
    if (index + 1 === words.length) {
      finished.current = true;
      onComplete({ answers: next, score: next.filter((answer) => answer.correct).length * 10 });
    } else {
      setAnswers(next); setIndex(index + 1); setForgotten(false); nextStep(0);
    }
  }

  return <section className="mx-auto max-w-3xl space-y-5" aria-label="Học theo ngữ cảnh">
    <div className={styles.toolbar}><span className="font-bold text-ink">Từ {index + 1} / {words.length}</span><button className={styles.button} onClick={onExit}>Thoát phiên học</button></div>
    <div className={styles.progress} role="progressbar" aria-label="Tiến độ học" aria-valuemin={0} aria-valuemax={words.length} aria-valuenow={index}><span style={{ transform: `scaleX(${index / words.length})` }} /></div>
    <nav className={styles.steps} aria-label="Các bước của từ">{steps.map((item, position) => <button key={position} aria-current={position === stepIndex ? "step" : undefined} onClick={() => nextStep(position)}>{position + 1}. {item.label}</button>)}</nav>
    {step.kind === "typing" ? <div className={`${styles.details} space-y-4`}>
      <p className={styles.eyebrow}>Nhớ lại không nhìn đáp án</p><h2 className="text-3xl font-bold text-ink">{word.meaning}</h2>
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => {
        event.preventDefault();
        if (!typed.trim() || feedback !== null) return;
        const correct = normalizeVocabularyAnswer(typed) === normalizeVocabularyAnswer(word.word);
        setFeedback(correct); if (!correct) setForgotten(true);
      }}>
        <input ref={input} autoFocus className={styles.input} aria-label="Gõ từ tiếng Anh" placeholder="Gõ từ tiếng Anh..." value={typed} autoComplete="off" autoCapitalize="none" spellCheck={false} readOnly={feedback !== null} onChange={(event) => setTyped(event.target.value)} />
        <button className={`${styles.button} ${styles.primary}`} disabled={!typed.trim() || feedback !== null}>Kiểm tra</button>
      </form>
      {feedback !== null && <div role="status" className={feedback ? styles.success : styles.error}>{feedback ? "Chính xác!" : `Chưa đúng. Đáp án: ${word.word}`}{forgotten && <p className="mt-1 text-sm">Từ này sẽ nằm trong nhóm cần ôn khi lưu kết quả.</p>}</div>}
      <div className="flex flex-wrap gap-2">
        {feedback === false && <button className={styles.button} onClick={() => { setFeedback(null); setTyped(""); input.current?.focus(); }}>Gõ lại</button>}
        {feedback !== null ? <button className={`${styles.button} ${styles.primary}`} onClick={() => nextWord(feedback)}>Từ tiếp theo →</button> : <button className={styles.button} onClick={() => { setFeedback(false); setForgotten(true); }}>Chưa nhớ, xem đáp án</button>}
      </div>
    </div> : <>
      <button className={styles.card} onClick={() => setFlipped(!flipped)} aria-pressed={flipped} aria-label="Lật thẻ học">
        <small>{step.label} · {flipped ? "Nghĩa / bản dịch" : "Thử tự nhớ trước"}</small><strong>{flipped ? step.back : step.front}</strong><small>Bấm hoặc Space để lật</small>
      </button>
      <div className={styles.toolbar}>
        <button className={styles.button} onClick={() => speak(englishExampleForSpeech(step.front))}>Nghe phát âm</button>
        {flipped && <div className="flex flex-wrap gap-2"><button className={styles.button} onClick={() => { setForgotten(true); nextStep(Math.min(stepIndex + 1, steps.length - 1)); }}>Chưa nhớ · học tiếp</button><button className={`${styles.button} ${styles.primary}`} onClick={() => nextStep(Math.min(stepIndex + 1, steps.length - 1))}>Đã nhớ · bước tiếp →</button></div>}
      </div>
    </>}
    <p className="text-sm text-muted">Đi từ từ đơn đến cụm, câu và tự gõ lại. Tiến độ chỉ được ghi khi bạn chọn Lưu &amp; Hoàn thành.</p>
  </section>;
}
