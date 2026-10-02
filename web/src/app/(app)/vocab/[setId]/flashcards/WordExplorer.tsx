"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import { shuffleVocabulary } from "@/lib/vocab-arcade";
import { englishExampleForSpeech } from "@/lib/vocab-speech";
import useVocabularyAudio from "./useVocabularyAudio";
import styles from "./vocabulary.module.css";

export function WordDetails({ word }: { word: VocabWordCard }) {
  return <section className={`${styles.details} space-y-4`} aria-label="Chi tiết từ">
    {word.imageUrl && <Image key={word.imageUrl} src={word.imageUrl} alt={`Minh họa: ${word.word}`} width={240} height={160} unoptimized loading="lazy" className="mx-auto max-h-40 rounded-xl object-contain" onError={(event) => { event.currentTarget.hidden = true; }} />}
    {word.example && <div><h3>Trong ngữ cảnh</h3><p>{word.example}</p>{word.exampleTranslation && <p className="text-sm text-muted">{word.exampleTranslation}</p>}</div>}
    {!!word.phrases?.length && <div><h3>Cụm từ thường gặp</h3><ul className="space-y-2 text-sm">{word.phrases.map((phrase, index) => <li key={`${phrase.text}-${index}`}><strong>{phrase.text}</strong>{phrase.meaning && ` — ${phrase.meaning}`}</li>)}</ul></div>}
    {!!word.synonyms?.length && <p className="text-sm"><strong>Đồng nghĩa: </strong>{word.synonyms.join(" · ")}</p>}
    {!!word.antonyms?.length && <p className="text-sm"><strong>Trái nghĩa: </strong>{word.antonyms.join(" · ")}</p>}
    {!!word.wordFamily?.length && <p className="text-sm"><strong>Họ từ: </strong>{word.wordFamily.join(" · ")}</p>}
    {word.toeicTip && <p className="rounded-xl bg-info-soft p-3 text-sm text-info-ink"><strong>Mẹo TOEIC: </strong>{word.toeicTip}</p>}
    {!word.example && !word.phrases?.length && <p className="text-sm text-muted">Bộ từ này chưa có ví dụ hoặc cụm từ bổ sung.</p>}
  </section>;
}

export default function WordExplorer({ words, onLearn }: { words: VocabWordCard[]; onLearn: () => void }) {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [starred, setStarred] = useState<number[]>([]);
  const [starOnly, setStarOnly] = useState(false);
  const { speakWord, speak, stop } = useVocabularyAudio();
  const filtered = useMemo(() => {
    const normalized = query.toLocaleLowerCase("vi").trim();
    const selected = words.filter((word) => (!starOnly || starred.includes(word.id)) && `${word.word} ${word.meaning}`.toLocaleLowerCase("vi").includes(normalized));
    if (!order.length) return selected;
    const positions = new Map(order.map((wordId, position) => [wordId, position]));
    return selected.sort((left, right) => (positions.get(left.id) ?? 0) - (positions.get(right.id) ?? 0));
  }, [words, query, starOnly, starred, order]);
  const safeIndex = Math.min(index, Math.max(0, filtered.length - 1));
  const word = filtered[safeIndex];
  function move(next: number) { stop(); setIndex(next); setFlipped(false); }

  return <div className="space-y-5">
    <div className={styles.toolbar}>
      <label className="min-w-0 flex-1"><span className="sr-only">Tìm từ hoặc nghĩa</span><input className={styles.input} placeholder="Tìm từ hoặc nghĩa..." value={query} onChange={(event) => { setQuery(event.target.value); move(0); }} /></label>
      <button className={styles.button} aria-pressed={starOnly} onClick={() => { setStarOnly(!starOnly); move(0); }}>Gắn sao ({starred.length})</button>
      <button className={styles.button} onClick={() => { setOrder(shuffleVocabulary(words.map((item) => item.id))); move(0); }}>Xáo trộn</button>
    </div>
    {word ? <>
      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <div className={styles.toolbar}>
            <button className={styles.button} onClick={() => { setReverse(!reverse); setFlipped(false); }}>{reverse ? "Việt → Anh" : "Anh → Việt"}</button>
            <button className={styles.button} aria-pressed={starred.includes(word.id)} onClick={() => setStarred((current) => current.includes(word.id) ? current.filter((wordId) => wordId !== word.id) : [...current, word.id])}>{starred.includes(word.id) ? "★ Đã gắn sao" : "☆ Gắn sao từ này"}</button>
          </div>
          <button className={styles.card} aria-label={flipped ? "Lật về mặt trước" : "Lật thẻ xem đáp án"} aria-pressed={flipped} onClick={() => setFlipped(!flipped)} onKeyDown={(event) => {
            if (event.key === "ArrowRight" && safeIndex < filtered.length - 1) { event.preventDefault(); move(safeIndex + 1); }
            if (event.key === "ArrowLeft" && safeIndex > 0) { event.preventDefault(); move(safeIndex - 1); }
          }}>
            <small>{word.partOfSpeech || "Từ vựng"} · {flipped ? "Đáp án" : "Thử nhớ trước khi lật"}</small>
            <strong>{flipped !== reverse ? word.meaning : word.word}</strong>
            {flipped === reverse && <span className="text-muted">{word.phoneticUs || word.phonetic}</span>}
            <small>Bấm hoặc Space để lật thẻ</small>
          </button>
          <div className={styles.toolbar}>
            <button className={styles.button} disabled={safeIndex === 0} onClick={() => move(safeIndex - 1)}>← Trước</button>
            <span className="text-sm text-muted" aria-live="polite">{safeIndex + 1} / {filtered.length}</span>
            <button className={styles.button} disabled={safeIndex === filtered.length - 1} onClick={() => move(safeIndex + 1)}>Tiếp →</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={styles.button} onClick={() => speakWord(word, "us")}>Nghe US</button>
            <button className={styles.button} onClick={() => speakWord(word, "uk")}>Nghe UK</button>
            {word.example && <button className={styles.button} onClick={() => speak(englishExampleForSpeech(word.example!))}>Nghe ví dụ</button>}
          </div>
          <p className="text-xs text-muted">Gắn sao để lọc nhanh trong lần xem này; không thay đổi tiến độ học.</p>
          <button className={`${styles.button} ${styles.primary}`} onClick={onLearn}>Bắt đầu học theo ngữ cảnh →</button>
        </div>
        <WordDetails word={word} />
      </div>
      <section className="space-y-3" aria-label="Danh sách từ">
        <h2 className="font-bold text-ink">Từ trong bộ này ({filtered.length})</h2>
        <div className={styles.wordList}>{filtered.slice(Math.floor(safeIndex / 20) * 20, Math.floor(safeIndex / 20) * 20 + 20).map((item) => <button key={item.id} className={styles.wordRow} aria-current={item.id === word.id ? "true" : undefined} onClick={() => move(filtered.indexOf(item))}><strong>{item.word}<small className="ml-2 font-normal text-muted">{item.partOfSpeech}</small></strong><span>{item.meaning}{item.mastered && <small className="ml-2 text-success-ink">Đã thuộc</small>}</span></button>)}</div>
        {filtered.length > 20 && <div className="flex gap-2"><button className={styles.button} disabled={safeIndex < 20} onClick={() => move(Math.max(0, Math.floor(safeIndex / 20) * 20 - 20))}>20 từ trước</button><button className={styles.button} disabled={(Math.floor(safeIndex / 20) + 1) * 20 >= filtered.length} onClick={() => move((Math.floor(safeIndex / 20) + 1) * 20)}>20 từ tiếp</button></div>}
      </section>
    </> : <p role="status" className={styles.details}>Không có từ phù hợp. Thử bỏ lọc gắn sao hoặc đổi từ khóa.</p>}
  </div>;
}
