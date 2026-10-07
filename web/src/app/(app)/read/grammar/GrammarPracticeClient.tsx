"use client";

import { useEffect, useMemo, useState } from "react";
import { decodeHTML } from "entities";
import Link from "@/components/IntentLink";
import ThemeToggle from "@/components/ThemeToggle";
import { parseVocabularyEntries } from "@/lib/practice-vocabulary";
import type { GrammarCatalog, GrammarTopic } from "@/lib/storage/grammar-snapshot";

const display = (text: string | null) => decodeHTML(text ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "");
type Answers = Record<string, string>;
export default function GrammarPracticeClient({ topic, metadata, learnerId }: { topic: GrammarTopic; metadata: GrammarCatalog["topics"][number]; learnerId: string }) {
  const [subtopicId, setSubtopicId] = useState("all");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [bilingual, setBilingual] = useState(false);
  const [storageStatus, setStorageStatus] = useState("Tiến độ được lưu trên thiết bị này.");
  const [loaded, setLoaded] = useState(false);
  const storageKey = `englishweb:grammar:v1:${learnerId}:${topic.topicId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      const valid: Answers = {};
      for (const question of topic.questions) if (/^[A-D]$/.test(saved[question.id] ?? "")) valid[question.id] = saved[question.id];
      // Hydrate device progress only after the server-rendered first paint.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnswers(valid);
    } catch { setStorageStatus("Không thể đọc tiến độ trên thiết bị này."); }
    setLoaded(true);
  }, [storageKey, topic.questions]);
  const questions = useMemo(() => topic.questions.filter((question) => subtopicId === "all" || question.subtopicId === subtopicId), [subtopicId, topic.questions]);
  const question = questions[index];
  const selected = question ? answers[question.id] : undefined;
  const done = topic.questions.filter((entry) => answers[entry.id]).length;
  const correct = topic.questions.filter((entry) => answers[entry.id] === entry.answer).length;
  const vocabulary = question ? parseVocabularyEntries(typeof question.vocabulary === "string" ? question.vocabulary : JSON.stringify(question.vocabulary ?? "")) : [];
  function answer(letter: string) {
    if (!loaded || !question || selected) return;
    const updated = { ...answers, [question.id]: letter };
    setAnswers(updated);
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); }
    catch { setStorageStatus("Không thể lưu tiến độ. Bạn vẫn có thể tiếp tục luyện tập."); }
  }
  return <main className="mx-auto w-full max-w-4xl p-5 md:p-8">
    <header className="flex items-start justify-between gap-4">
      <div><Link href="/read/grammar" className="text-sm font-bold text-teal-ink">← Ngữ pháp</Link><h1 className="mt-4 text-2xl font-extrabold text-ink">{metadata.title}</h1></div>
      <ThemeToggle />
    </header>
    <p className="mt-3 text-sm text-muted">{storageStatus}</p>
    <p className="mt-2 text-sm font-bold text-ink">Đã làm {done}/{topic.questions.length} · Đúng {correct}</p>
    <div className="my-6 flex flex-wrap items-center gap-3">
      <label className="text-sm font-bold text-ink">Chuyên đề <select className="ml-2 rounded-xl border border-line bg-surface p-2" value={subtopicId} onChange={(event) => { setSubtopicId(event.target.value); setIndex(0); }}>
        <option value="all">Tất cả</option>{metadata.subtopics.map((subtopic) => <option key={subtopic.id} value={subtopic.id}>{subtopic.title} ({subtopic.questionCount})</option>)}
      </select></label>
      <button type="button" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold" aria-pressed={bilingual} onClick={() => setBilingual((value) => !value)}>Song ngữ</button>
    </div>
    {!question ? <p className="rounded-2xl border border-line bg-surface p-5">Chuyên đề này chưa có câu hỏi.</p> : <article className="rounded-2xl border border-line bg-surface p-5 md:p-7">
      <p className="text-sm font-bold text-muted">Câu {index + 1}/{questions.length}</p>
      <h2 className="mt-4 whitespace-pre-wrap text-xl font-extrabold leading-relaxed text-ink">{display(question.text)}</h2>
      {bilingual && question.translation && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-teal-soft p-4 text-teal-ink" lang="vi">{display(question.translation)}</p>}
      <div className="mt-5 space-y-3">{(["A", "B", "C", "D"] as const).filter((letter) => question.options[letter]).map((letter) => {
        const isCorrect = Boolean(selected) && letter === question.answer;
        const isWrong = selected === letter && letter !== question.answer;
        return <button type="button" key={letter} disabled={!loaded || Boolean(selected)} aria-pressed={selected === letter} onClick={() => answer(letter)} className={`flex w-full gap-3 rounded-xl border p-4 text-left font-bold ${isCorrect ? "border-teal-line bg-teal-soft text-teal-ink" : isWrong ? "border-rose-300 bg-rose-50 text-rose-800" : "border-line bg-surface text-ink"}`}><span>{letter}.</span><span>{display(question.options[letter])}</span>{isCorrect && <span className="ml-auto">✓</span>}{isWrong && <span className="ml-auto">✕</span>}</button>;
      })}</div>
      {selected && <section aria-live="polite" className="mt-5 space-y-4">
        <p className="font-extrabold text-ink">{selected === question.answer ? "Chính xác!" : `Đáp án đúng: ${question.answer}`}</p>
        {question.explanation && <div className="rounded-xl bg-surface-soft p-4"><h3 className="font-extrabold text-ink">Giải thích</h3><p className="mt-2 whitespace-pre-wrap text-ink">{display(question.explanation)}</p></div>}
        {!bilingual && question.translation && <p className="whitespace-pre-wrap rounded-xl bg-teal-soft p-4 text-teal-ink" lang="vi">{display(question.translation)}</p>}
        {vocabulary.length > 0 && <div className="rounded-xl bg-surface-soft p-4"><h3 className="font-extrabold text-ink">Từ vựng</h3><ul className="mt-2 space-y-2">{vocabulary.map((entry) => <li key={entry.id} className="text-ink"><strong>{entry.word}</strong> — {entry.meaning}</li>)}</ul></div>}
      </section>}
    </article>}
    <nav aria-label="Chuyển câu hỏi" className="mt-5 flex items-center justify-between gap-3"><button type="button" disabled={index === 0} onClick={() => setIndex((value) => value - 1)} className="rounded-xl border border-line bg-surface px-4 py-3 font-bold disabled:opacity-40">← Câu trước</button><button type="button" disabled={index >= questions.length - 1} onClick={() => setIndex((value) => value + 1)} className="rounded-xl bg-teal-soft px-4 py-3 font-bold text-teal-ink disabled:opacity-40">Câu tiếp →</button></nav>
  </main>;
}
