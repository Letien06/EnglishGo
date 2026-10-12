"use client";

import { useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import { matchesVocabAnswer } from "@/lib/vocab-quiz";
import { useVocabReviewQueue } from "@/lib/vocab-review-queue";
import useVocabularyAudio from "../[setId]/flashcards/useVocabularyAudio";

export default function WrongWordReview({ words, uid, authenticated, onProgress }: {
  words: VocabWordCard[]; uid?: string; authenticated: boolean; onProgress?: () => void;
}) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const { enqueue } = useVocabReviewQueue(uid, authenticated);
  const { speakWord } = useVocabularyAudio();
  const deck = [...new Map(words.map((word) => [word.id, word])).values()];
  if (!deck.length) return null;
  if (!started) return <button type="button" className="w-full rounded-xl border border-line bg-surface px-4 py-3 font-bold text-ink" onClick={() => setStarted(true)}>Ôn lại {deck.length} từ vừa sai</button>;
  const word = deck[index];
  if (!word) return <p className="rounded-xl border border-line bg-surface p-4 text-ink" role="status">Đã ôn lại {deck.length} từ. {authenticated && uid ? "Lịch ôn ngày mai đã được đưa vào hàng đợi lưu." : "Đăng nhập để lưu lịch ôn ngày mai."}</p>;
  function check() {
    if (!typed.trim() || feedback !== null) return;
    const correct = matchesVocabAnswer(typed, word.word, "english");
    setFeedback(correct);
    if (authenticated && uid) { enqueue({ wordId: word.id, quality: correct ? 4 : 1, reviewTomorrow: true }); onProgress?.(); }
    speakWord(word, "us");
  }
  return <section aria-label="Ôn từ vừa sai" className="space-y-3 rounded-xl border border-line bg-surface p-4 text-ink">
    <h3 className="font-bold">Ôn nhanh · {index + 1}/{deck.length}</h3>
    <p>{word.meaning}</p>
    <form onSubmit={(event) => { event.preventDefault(); if (feedback === null) check(); else { setIndex(index + 1); setTyped(""); setFeedback(null); } }}>
      <label className="block">Gõ từ tiếng Anh<input key={word.id} className="mt-1 block w-full rounded-lg border border-line bg-surface p-3" value={typed} onChange={(event) => setTyped(event.target.value)} readOnly={feedback !== null} autoComplete="off" /></label>
      {feedback !== null && <div className="mt-3 space-y-2"><p>{feedback ? "Đúng rồi!" : "Đáp án đúng:"} <strong>{word.word}</strong> — {word.meaning}</p>{word.example && <p>{word.example}</p>}{word.exampleTranslation && <p>{word.exampleTranslation}</p>}<button type="button" onClick={() => speakWord(word, "us")}>Nghe đáp án đúng</button><p className="text-sm">Từ này cần được ôn lại ngày mai để nhớ lâu hơn.</p></div>}
      <button className="mt-3 rounded-lg bg-primary px-4 py-2 font-bold text-gold-ink" type="submit" disabled={feedback === null && !typed.trim()}>{feedback === null ? "Kiểm tra" : index + 1 === deck.length ? "Hoàn thành ôn nhanh" : "Từ tiếp theo"}</button>
    </form>
  </section>;
}
