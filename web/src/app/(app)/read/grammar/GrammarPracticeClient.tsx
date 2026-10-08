"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { decodeHTML } from "entities";
import Link from "@/components/IntentLink";
import ThemeToggle from "@/components/ThemeToggle";
import SelectionDictionary from "@/components/SelectionDictionary";
import { parseVocabularyEntries } from "@/lib/practice-vocabulary";
import { grammarStorageKey, grammarAnswerKey, readGrammarAnswers, getGrammarProgress, type GrammarAnswers } from "@/lib/grammar-learning";
import type { GrammarCatalog, GrammarTopic } from "@/lib/storage/grammar-snapshot";

const display = (text: string | null) => decodeHTML(text ?? "")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n\n")
  .replace(/<[^>]*>/g, "");
function SourceParagraphs({ text }: { text: string }) {
  return <div className="space-y-3">{display(text).split(/\n+/).filter((line) => line.trim()).map((line, index) => {
    const step = line.match(/^(\s*(?:\*\*)?Bước\s*[123](?:\*\*)?\s*[:.)–-]?)([\s\S]*)$/i);
    return <p key={index} className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">{step ? <><strong className="font-extrabold">{step[1].replace(/\*\*/g, "")}</strong>{step[2]}</> : line}</p>;
  })}</div>;
}
const button = "rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-ink disabled:opacity-40";

export default function GrammarPracticeClient({ topic, metadata, learnerId }: { topic: GrammarTopic; metadata: GrammarCatalog["topics"][number]; learnerId: string }) {
  const [subtopicId, setSubtopicId] = useState("all");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<GrammarAnswers>({});
  const [bilingual, setBilingual] = useState(false);
  const [storageStatus, setStorageStatus] = useState("Tiến độ được lưu trên thiết bị này.");
  const [loaded, setLoaded] = useState(false);
  const [progressKnown, setProgressKnown] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panels, setPanels] = useState({ explanation: true, translation: true, vocabulary: false });
  const vocabularyPool = useMemo(() => topic.questions.map((entry) => entry.vocabulary), [topic.questions]);
  const storageKey = grammarStorageKey(learnerId, topic.topicId);
  const answerKey = useMemo(() => grammarAnswerKey(topic), [topic]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      let valid: GrammarAnswers = {};
      try {
        valid = readGrammarAnswers(localStorage.getItem(storageKey), answerKey);
        setProgressKnown(true);
      } catch { setStorageStatus("Không thể đọc tiến độ trên thiết bị này."); }
      const unanswered = topic.questions.findIndex((question) => !valid[question.id]);
      setAnswers(valid);
      setSubtopicId("all");
      setIndex(Math.max(0, unanswered));
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [storageKey, topic.questions, answerKey]);
  const questions = useMemo(() => topic.questions.filter((question) => subtopicId === "all" || question.subtopicId === subtopicId), [subtopicId, topic.questions]);
  const question = questions[index];
  const selected = question ? answers[question.id] : undefined;
  const activeSubtopic = metadata.subtopics.find((entry) => entry.id === question?.subtopicId);
  const { answered: done, correct } = getGrammarProgress(answerKey, answers);
  const vocabulary = question ? parseVocabularyEntries(typeof question.vocabulary === "string" ? question.vocabulary : JSON.stringify(question.vocabulary ?? "")) : [];
  const answer = useCallback((letter: string) => {
    if (!loaded || !question || selected || !/^[A-D]$/.test(letter) || !question.options[letter as "A" | "B" | "C" | "D"]?.trim()) return;
    const updated = { ...answers, [question.id]: letter };
    setAnswers(updated);
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); }
    catch { setStorageStatus("Không thể lưu tiến độ. Bạn vẫn có thể tiếp tục luyện tập."); }
  }, [loaded, question, selected, answers, storageKey]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[aria-modal="true"]') || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat || (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']"))) return;
      if (/^[1-4]$/.test(event.key)) { event.preventDefault(); answer(["A", "B", "C", "D"][Number(event.key) - 1]); }
      if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); setIndex(index - 1); }
      if (event.key === "ArrowRight" && index < questions.length - 1) { event.preventDefault(); setIndex(index + 1); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [answer, index, questions.length]);
  function selectSubtopic(id: string) {
    const group = topic.questions.filter((entry) => id === "all" || entry.subtopicId === id);
    setSubtopicId(id);
    setIndex(Math.max(0, group.findIndex((entry) => !answers[entry.id])));
  }
  function subtopicButton(id: string, title: string, total: number) {
    const group = topic.questions.filter((entry) => id === "all" || entry.subtopicId === id);
    const { answered: completed, correct: right } = getGrammarProgress(Object.fromEntries(group.map((entry) => [entry.id, entry.answer])), answers);
    return <button type="button" key={id} aria-label={`Chuyên đề: ${title}`} aria-current={subtopicId === id ? "true" : undefined} onClick={() => selectSubtopic(id)} className={`w-full rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-teal-ink ${subtopicId === id ? "border-teal-line bg-teal-soft" : "border-transparent hover:bg-surface-soft"}`}>
      <span className="block text-sm font-extrabold text-ink">{title}</span>
      <span className="mt-2 block text-xs tabular-nums text-muted">Đã làm {progressKnown ? completed : "—"}/{total} · Đúng {progressKnown ? right : "—"} · Sai {progressKnown ? completed - right : "—"}</span>
      <span role="progressbar" aria-label={`Tiến độ ${title}`} aria-valuenow={progressKnown ? completed : undefined} aria-valuemin={0} aria-valuemax={total} className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-teal-ink" style={{ width: `${progressKnown && total ? completed / total * 100 : 0}%` }} /></span>
    </button>;
  }
  return <SelectionDictionary learnerId={learnerId} vocabulary={question?.vocabulary} vocabularyPool={vocabularyPool} context={{ id: question?.id ?? topic.topicId, title: `Ngữ pháp · ${metadata.title}`, sentence: display(question?.text ?? "") }}><main className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6 md:py-7">
    <header className="mb-5 flex items-start justify-between gap-4">
      <div><Link href="/read/grammar" className="text-sm font-bold text-teal-ink">← Thư viện ngữ pháp</Link><p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted">{metadata.bigTopic || "Ngữ pháp TOEIC"}</p><h1 className="mt-1 text-2xl font-extrabold text-ink">{metadata.title}</h1><p className="mt-2 text-sm font-bold text-muted">Đã làm {progressKnown ? done : "—"}/{topic.questions.length} · Đúng {progressKnown ? correct : "—"} · Sai {progressKnown ? done - correct : "—"}</p></div>
      <ThemeToggle />
    </header>
    <div className="grid items-start gap-5 xl:grid-cols-[230px_minmax(0,1fr)_minmax(0,1.15fr)]">
      <aside className="rounded-2xl border border-line bg-surface xl:sticky xl:top-24" aria-label="Chuyên đề ngữ pháp">
        <button type="button" aria-expanded={sidebarOpen} aria-controls="grammar-subtopics" onClick={() => setSidebarOpen((value) => !value)} className="flex min-h-14 w-full items-center justify-between p-4 font-extrabold text-ink xl:hidden">Chuyên đề <span className="text-xs font-normal text-muted">{sidebarOpen ? "Thu gọn ↑" : "Mở danh sách ↓"}</span></button>
        <h2 className="hidden p-4 font-extrabold text-ink xl:block">Chuyên đề</h2>
        <div id="grammar-subtopics" className={`${sidebarOpen ? "block" : "hidden"} space-y-1 border-t border-line p-2 xl:block xl:max-h-[calc(100dvh-260px)] xl:overflow-y-auto`}>
          {subtopicButton("all", "Tất cả", topic.questions.length)}
          {metadata.subtopics.map((entry) => subtopicButton(entry.id, entry.title, entry.questionCount))}
        </div>
        <p className="border-t border-line p-4 text-xs leading-relaxed text-muted" role="status">{storageStatus}</p>
      </aside>
      <section className="min-w-0" aria-label="Luyện câu hỏi">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-muted">{activeSubtopic?.title || "Tất cả chuyên đề"}</p><button type="button" className={button} aria-pressed={bilingual} onClick={() => setBilingual((value) => !value)}>Song ngữ</button></div>
        {!question ? <div className="rounded-2xl border border-line bg-surface p-7 text-muted">Chuyên đề này chưa có câu hỏi.</div> : <article className="min-h-[380px] rounded-2xl border border-line bg-surface p-5 md:p-7">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-extrabold tabular-nums text-muted">Câu {index + 1}/{questions.length}</p><span className="text-xs text-muted">Chọn đáp án 1–4</span></div>
          <h2 className="mt-6 whitespace-pre-wrap text-xl font-extrabold leading-relaxed text-ink">{display(question.text)}</h2>
          {bilingual && question.translation && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-teal-soft p-4 text-teal-ink" lang="vi">{display(question.translation)}</p>}
          <div className="mt-6 space-y-3">{(["A", "B", "C", "D"] as const).filter((letter) => question.options[letter]?.trim()).map((letter) => {
            const isCorrect = Boolean(selected) && letter === question.answer;
            const isWrong = selected === letter && letter !== question.answer;
            return <button type="button" key={letter} disabled={!loaded || Boolean(selected)} aria-pressed={selected === letter} onClick={() => answer(letter)} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border p-4 text-left font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-ink ${isCorrect ? "border-teal-line bg-teal-soft text-teal-ink" : isWrong ? "border-rose-300 bg-rose-50 text-rose-800" : "border-line bg-surface text-ink enabled:hover:bg-surface-soft"}`}><span>{letter}.</span><span>{display(question.options[letter])}</span>{isCorrect && <span className="ml-auto" aria-label="Đáp án đúng">✓</span>}{isWrong && <span className="ml-auto" aria-label="Đáp án sai">✕</span>}</button>;
          })}</div>
        </article>}
        <nav aria-label="Chuyển câu hỏi" className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={index === 0} onClick={() => setIndex((value) => value - 1)} className={button}>← Câu trước</button><button type="button" disabled={index >= questions.length - 1} onClick={() => setIndex((value) => value + 1)} className={button}>Câu tiếp →</button></nav>
        <details className="mt-5 rounded-xl border border-line bg-surface"><summary className="cursor-pointer p-4 text-sm font-bold text-ink">Danh sách câu ({questions.length})</summary><nav aria-label="Danh sách câu hỏi" className="flex flex-wrap gap-2 border-t border-line p-4">{questions.map((entry, position) => <button type="button" key={entry.id} onClick={() => setIndex(position)} aria-label={`Câu ${position + 1}${answers[entry.id] ? answers[entry.id] === entry.answer ? ", đã trả lời đúng" : ", đã trả lời sai" : ", chưa làm"}`} aria-current={position === index ? "true" : undefined} className={`h-10 min-w-10 rounded-lg border text-sm font-bold ${position === index ? "border-teal-ink ring-1 ring-teal-ink" : "border-line"} ${answers[entry.id] ? answers[entry.id] === entry.answer ? "bg-teal-soft text-teal-ink" : "bg-rose-50 text-rose-800" : "bg-surface text-muted"}`}>{position + 1}</button>)}</nav></details>
      </section>
      <aside aria-label="Giải thích và từ vựng" className="min-h-[380px] min-w-0 space-y-4 xl:sticky xl:top-24">
        {!question || !selected ? <section className="min-h-[380px] rounded-2xl border border-line bg-surface p-5"><h2 className="text-base font-extrabold text-ink">Giải thích chi tiết</h2><p className="mt-5 rounded-xl border border-dashed border-line p-5 text-sm leading-relaxed text-muted">Chọn một đáp án để xem giải thích đầy đủ, bản dịch và từ vựng của câu này.</p></section> : <>
          <p aria-live="polite" className="rounded-xl bg-surface-soft p-3 text-sm font-extrabold text-ink">{selected === question.answer ? "Chính xác!" : `Đáp án đúng: ${question.answer}`}</p>
          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <h2><button type="button" data-dictionary-ignore aria-expanded={panels.explanation} aria-controls="grammar-explanation-content" onClick={() => setPanels((value) => ({ ...value, explanation: !value.explanation }))} className="flex min-h-14 w-full items-center justify-between gap-3 p-5 text-left font-extrabold text-ink">Giải thích chi tiết <span aria-hidden="true">{panels.explanation ? "−" : "+"}</span></button></h2>
            {panels.explanation && <div id="grammar-explanation-content" className="border-t border-line p-5">{question.explanation ? <SourceParagraphs text={question.explanation} /> : <p className="text-sm leading-relaxed text-muted">Nguồn chưa cung cấp giải thích cho câu này.</p>}</div>}
          </section>
          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <h2><button type="button" data-dictionary-ignore aria-expanded={panels.translation} aria-controls="grammar-translation-content" onClick={() => setPanels((value) => ({ ...value, translation: !value.translation }))} className="flex min-h-14 w-full items-center justify-between gap-3 p-5 text-left font-extrabold text-ink">Dịch nghĩa câu hỏi <span aria-hidden="true">{panels.translation ? "−" : "+"}</span></button></h2>
            {panels.translation && <div id="grammar-translation-content" lang="vi" className="border-t border-line p-5">{question.translation ? <SourceParagraphs text={question.translation} /> : <p className="text-sm leading-relaxed text-muted">Nguồn chưa cung cấp bản dịch cho câu này.</p>}</div>}
          </section>
          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <h2><button type="button" data-dictionary-ignore aria-expanded={panels.vocabulary} aria-controls="grammar-vocabulary-content" onClick={() => setPanels((value) => ({ ...value, vocabulary: !value.vocabulary }))} className="flex min-h-14 w-full items-center justify-between gap-3 p-5 text-left font-extrabold text-ink">Từ vựng nên học <span aria-hidden="true">{panels.vocabulary ? "−" : "+"}</span></button></h2>
            {panels.vocabulary && <div id="grammar-vocabulary-content" className="border-t border-line p-5">{vocabulary.length ? <ul className="space-y-4">{vocabulary.map((entry) => <li key={entry.id} className="rounded-xl bg-surface-soft p-4 text-sm leading-7 text-muted"><strong className="text-ink">{entry.word}</strong>{entry.partOfSpeech && <span> ({entry.partOfSpeech})</span>} — {entry.meaning}<details className="mt-2"><summary className="cursor-pointer font-bold text-teal-ink" data-dictionary-ignore>Chi tiết từ {entry.word}</summary><p className="mt-2 whitespace-pre-wrap break-words">{entry.raw}</p></details></li>)}</ul> : <p className="text-sm leading-relaxed text-muted">Nguồn chưa cung cấp từ vựng cho câu này.</p>}</div>}
          </section>
        </>}
      </aside>
    </div>
  </main></SelectionDictionary>;
}
