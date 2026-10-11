"use client";

import Link from "next/link";
import { useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import ContextLearning from "../[setId]/flashcards/modes/ContextLearning";
import StudySaveStatus from "@/components/StudySaveStatus";
import PracticeSaveGuard from "@/components/PracticeSaveGuard";
import { useVocabReviewQueue } from "@/lib/vocab-review-queue";

export default function ReviewTodayClient({ uid, words }: { uid: string; words: VocabWordCard[] }) {
  const queue = useVocabReviewQueue(uid, true);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  return <main className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
    <Link href="/vocab">← Bộ từ vựng</Link>
    <h1 className="text-2xl font-extrabold text-ink">Ôn hôm nay</h1>
    <p className="text-sm text-muted">Từ đã đến hạn từ các bộ bạn học; ưu tiên từ cần học lại, rồi từ lâu chưa ôn. Mỗi lượt tối đa 50 từ.</p>
    <StudySaveStatus {...queue} />
    <PracticeSaveGuard queue={queue} backHref="/vocab" />
    {!words.length ? <p>Chưa có từ đến hạn. Bạn có thể học tiếp hoặc ôn từ đã thuộc trong từng bộ.</p>
      : finished ? <section className="rounded-xl border border-line p-6"><h2 className="text-xl font-bold">Đã hoàn thành lượt ôn</h2><Link href="/vocab/review?next=1" onClick={() => window.location.assign("/vocab/review")}>Xem lượt ôn tiếp theo →</Link></section>
      : started ? <ContextLearning words={words} currentUserId={uid} isAuthenticated studyIntent="review" onComplete={() => setFinished(true)} onExit={() => setStarted(false)} />
      : <><button type="button" className="rounded-xl bg-primary px-5 py-3 font-bold text-gold-ink" onClick={() => setStarted(true)}>Ôn {words.length} từ đến hạn</button>
        <ul className="divide-y divide-line rounded-xl border border-line">{words.map((word) => <li key={word.id} className="flex flex-wrap justify-between gap-2 p-4"><strong>{word.word}</strong><span>{word.meaning}</span></li>)}</ul></>}
  </main>;
}
