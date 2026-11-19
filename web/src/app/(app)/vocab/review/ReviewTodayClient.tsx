"use client";

import Link from "next/link";
import { useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import ContextLearning from "../[setId]/flashcards/modes/ContextLearning";
import StudySaveStatus from "@/components/StudySaveStatus";
import PracticeSaveGuard from "@/components/PracticeSaveGuard";
import { useVocabReviewQueue } from "@/lib/vocab-review-queue";
import WrongWordReview from "./WrongWordReview";
import type { VocabularyRoundResult } from "@/lib/vocab-arcade";

function playWordAudio(word: VocabWordCard) {
  const url = word.audioUsUrl || word.audioUrl || word.audioUkUrl;
  if (url) {
    const audio = new Audio(url);
    audio.play().catch(() => undefined);
    return;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }
}

export default function ReviewTodayClient({ uid, words }: { uid: string; words: VocabWordCard[] }) {
  const queue = useVocabReviewQueue(uid, true);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [wrongWords, setWrongWords] = useState<VocabWordCard[]>([]);

  const relearningCount = words.filter((w) => !w.mastered).length;
  const dueReviewCount = Math.max(0, words.length - relearningCount);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/vocab" className="text-sm font-bold text-primary no-underline hover:underline">
            ← Bộ từ vựng
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">Ôn hôm nay</h1>
          <p className="mt-1 text-sm text-muted">
            Từ đã đến hạn theo lịch lặp lại ngắt quãng (SM-2) và các câu nghe/đọc bạn từng làm sai.
          </p>
        </div>
        {words.length > 0 && !started && !finished && (
          <button
            type="button"
            className="rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-gold-ink shadow-sm transition-transform active:scale-95"
            onClick={() => setStarted(true)}
          >
            Bắt đầu ôn {words.length} từ đến hạn →
          </button>
        )}
      </div>

      <StudySaveStatus {...queue} />
      <PracticeSaveGuard queue={queue} backHref="/vocab" />

      {!started && !finished && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Tổng quan từ cần ôn">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted">Tổng từ đến hạn</span>
            <p className="mt-1 text-2xl font-black tabular-nums text-ink">{words.length} <span className="text-sm font-semibold text-muted">từ</span></p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted">Cần học lại trong ngày</span>
            <p className="mt-1 text-2xl font-black tabular-nums text-ink">{relearningCount} <span className="text-sm font-semibold text-muted">từ</span></p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted">Ôn định kỳ SM-2</span>
            <p className="mt-1 text-2xl font-black tabular-nums text-ink">{dueReviewCount} <span className="text-sm font-semibold text-muted">từ</span></p>
          </div>
        </section>
      )}

      {!words.length ? (
        <section className="rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="font-bold text-ink">Tuyệt vời! Bạn chưa có từ vựng nào đến hạn lúc này.</p>
          <p className="mt-1 text-sm text-muted">Bạn có thể học thêm từ mới trong các bộ từ vựng hoặc ôn các câu nghe/đọc sai bên dưới.</p>
        </section>
      ) : finished ? (
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-xl font-extrabold text-ink">Đã hoàn thành lượt ôn từ vựng</h2>
          {wrongWords.length > 0 && <WrongWordReview words={wrongWords} uid={uid} authenticated onProgress={queue.retry} />}
          <Link
            href="/vocab/review?next=1"
            onClick={() => window.location.assign("/vocab/review")}
            className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-gold-ink no-underline"
          >
            Xem lượt ôn tiếp theo →
          </Link>
        </section>
      ) : started ? (
        <ContextLearning
          words={words}
          currentUserId={uid}
          isAuthenticated
          studyIntent="review"
          onComplete={(result: VocabularyRoundResult) => {
            setWrongWords(result.answers.filter((answer) => !answer.correct).map((answer) => answer.item));
            setFinished(true);
          }}
          onExit={() => setStarted(false)}
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {words.map((word) => (
            <li key={word.id} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-surface-soft/50">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => playWordAudio(word)}
                  aria-label={`Phát âm ${word.word}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-soft text-sm hover:border-primary"
                >
                  🔊
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-base font-extrabold text-ink">{word.word}</strong>
                    {word.partOfSpeech && (
                      <span className="rounded bg-surface-soft px-1.5 py-0.5 text-xs font-semibold italic text-muted">
                        {word.partOfSpeech}
                      </span>
                    )}
                    {(word.phoneticUs || word.phonetic) && (
                      <span className="font-mono text-xs text-muted">{word.phoneticUs || word.phonetic}</span>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-sm font-semibold text-ink2">{word.meaning}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
