"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import useDialogFocus from "./useDialogFocus";
import DictionaryWordBasket from "./DictionaryWordBasket";
import { saveDictionaryWord } from "@/lib/dictionary-word-basket";
import { findBestEnglishVoice } from "@/lib/vocab-speech";
import { dictionaryFallbackEntry, lookupSelectionDictionary, normalizeSelectionWord, parseSelectionVocabulary, type SelectionDictionaryEntry } from "@/lib/selection-dictionary";

type Context = { id: string; title: string; sentence: string };
type Result = { entry: SelectionDictionaryEntry; scope: "question" | "topic" | "library" | "dictionary" };
type Props = { children: ReactNode; learnerId: string; vocabulary: unknown; vocabularyPool: readonly unknown[]; context: Context };
const control = "min-h-10 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-ink disabled:opacity-50";
const validTerm = (value: string) => /^[A-Za-z][A-Za-z'’\- ]{0,78}$/.test(value) && value.split(/\s+/).length <= 5;

function matchedEntry(match: ReturnType<typeof lookupSelectionDictionary>): SelectionDictionaryEntry | null {
  if (!match) return null;
  if (!match.family?.meaning) return match.entry;
  return { ...match.entry, word: match.matchedWord, meaning: match.family.meaning, partOfSpeech: match.family.partOfSpeech, phonetic: "", phoneticUs: "", phoneticUk: "", audioUrl: "", audioUsUrl: "", audioUkUrl: "", example: "", exampleTranslation: "", phrases: [], synonyms: [], antonyms: [] };
}

export default function SelectionDictionary({ children, learnerId, vocabulary, vocabularyPool, context }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const cache = useRef(new Map<string, Result>());
  const audio = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [flipped, setFlipped] = useState(false);
  const topicEntries = useMemo(() => vocabularyPool.flatMap(parseSelectionVocabulary), [vocabularyPool]);
  const index = useMemo(() => ({ question: parseSelectionVocabulary(vocabulary), topic: topicEntries }), [vocabulary, topicEntries]);

  const stopAudio = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    if (utteranceRef.current && "speechSynthesis" in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
  }, []);
  const close = useCallback(() => {
    request.current?.abort();
    requestNumber.current += 1;
    stopAudio();
    setOpen(false);
  }, [stopAudio]);
  useDialogFocus(open, close, dialog);
  useEffect(() => () => { request.current?.abort(); stopAudio(); }, [stopAudio]);

  const lookup = useCallback(async (value: string) => {
    const word = normalizeSelectionWord(value);
    if (!validTerm(word)) { setError("Chọn một từ hoặc cụm từ tiếng Anh ngắn (tối đa 5 từ)."); return; }
    stopAudio();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++requestNumber.current;
    setOpen(true); setTerm(word); setResult(null); setError(""); setNotice(""); setFlipped(false);
    const local = lookupSelectionDictionary(word, index);
    const entry = matchedEntry(local);
    if (entry && local) { setResult({ entry, scope: local.scope }); setLoading(false); return; }
    const cached = cache.current.get(word);
    if (cached) { setResult(cached); setLoading(false); return; }
    setLoading(true);
    try {
      const query = new URLSearchParams({ word });
      const libraryResponse = await fetch(`/api/grammar/dictionary?${query}`, { signal: controller.signal });
      let found: Result;
      if (libraryResponse.ok) {
        const payload = await libraryResponse.json();
        const match = payload.data as ReturnType<typeof lookupSelectionDictionary>;
        const verified = matchedEntry(match);
        if (!payload.success || !verified) throw new Error("Chưa có kết quả tra từ hợp lệ.");
        found = { entry: verified, scope: "library" };
      } else {
        if (libraryResponse.status !== 404) throw new Error("Chưa tải được từ điển bài học. Hãy thử lại.");
        const response = await fetch(`/api/vocab/dictionary?${query}`, { signal: controller.signal });
        if (!response.ok) {
          if (response.status === 401) throw new Error("Đăng nhập để tra từ chưa có trong bài học.");
          if (response.status === 404) throw new Error("Chưa tìm thấy từ này. Bạn có thể thử dạng từ gốc.");
          if (response.status === 429) throw new Error("Đã đạt giới hạn tra từ. Hãy thử lại sau.");
          throw new Error("Chưa tải được từ điển. Hãy kiểm tra kết nối và thử lại.");
        }
        const verified = dictionaryFallbackEntry(await response.json());
        if (!verified) throw new Error("Chưa có kết quả tra từ hợp lệ.");
        found = { entry: verified, scope: "dictionary" };
      }
      if (controller.signal.aborted || current !== requestNumber.current) return;
      if (cache.current.size >= 100) cache.current.delete(cache.current.keys().next().value!);
      cache.current.set(word, found); setResult(found);
    } catch (reason) {
      if (!controller.signal.aborted && current === requestNumber.current) setError(reason instanceof Error ? reason.message : "Chưa tra được từ. Hãy thử lại.");
    } finally {
      if (!controller.signal.aborted && current === requestNumber.current) setLoading(false);
    }
  }, [index, stopAudio]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pointerDown = false;
    function readSelection() {
      if (open || pointerDown || document.querySelector('[aria-modal="true"]')) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount !== 1 || !root.current?.contains(selection.anchorNode) || !root.current.contains(selection.focusNode)) return;
      const element = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
      if (element?.closest('input, textarea, select, [contenteditable="true"], [data-dictionary-ignore]')) return;
      const word = selection.toString().trim().replace(/^[.,!?;:"“”()\s]+|[.,!?;:"“”()\s]+$/g, "").replace(/\s+/g, " ");
      if (validTerm(word)) { selection.removeAllRanges(); void lookup(word); }
    }
    function selectionChanged() { clearTimeout(timer); timer = setTimeout(readSelection, 450); }
    function pointerStart() { pointerDown = true; clearTimeout(timer); }
    function pointerEnd() { pointerDown = false; clearTimeout(timer); timer = setTimeout(readSelection, 80); }
    function pointerCancel() { pointerDown = false; clearTimeout(timer); }
    function keyboardEnd(event: KeyboardEvent) { if (event.key === "Shift" || event.shiftKey) { clearTimeout(timer); timer = setTimeout(readSelection, 80); } }
    document.addEventListener("selectionchange", selectionChanged);
    document.addEventListener("pointerdown", pointerStart);
    document.addEventListener("pointerup", pointerEnd);
    document.addEventListener("pointercancel", pointerCancel);
    window.addEventListener("blur", pointerCancel);
    document.addEventListener("keyup", keyboardEnd);
    return () => { clearTimeout(timer); document.removeEventListener("selectionchange", selectionChanged); document.removeEventListener("pointerdown", pointerStart); document.removeEventListener("pointerup", pointerEnd); document.removeEventListener("pointercancel", pointerCancel); window.removeEventListener("blur", pointerCancel); document.removeEventListener("keyup", keyboardEnd); };
  }, [lookup, open]);

  function pronounce(accent: "us" | "uk") {
    if (!result) return;
    stopAudio(); setNotice("");
    const current = requestNumber.current;
    const url = accent === "us" ? result.entry.audioUsUrl || result.entry.audioUrl : result.entry.audioUkUrl || result.entry.audioUrl;
    const speak = () => {
      if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") { setNotice("Trình duyệt này chưa hỗ trợ phát âm."); return; }
      const utterance = new SpeechSynthesisUtterance(result.entry.word);
      utterance.lang = accent === "us" ? "en-US" : "en-GB";
      utterance.rate = 0.85;
      const voice = findBestEnglishVoice(accent);
      if (voice) utterance.voice = voice;
      utteranceRef.current = utterance;
      utterance.onend = () => { if (utteranceRef.current === utterance) utteranceRef.current = null; };
      utterance.onerror = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        if (current === requestNumber.current) setNotice("Chưa phát được giọng đọc. Hãy thử lại.");
      };
      try { window.speechSynthesis.speak(utterance); }
      catch { utteranceRef.current = null; setNotice("Chưa phát được giọng đọc. Hãy thử lại."); }
    };
    if (url && /^https:\/\//i.test(url)) {
      const player = new Audio(url); audio.current = player;
      void player.play().catch(() => { if (audio.current === player && current === requestNumber.current) speak(); });
    } else speak();
  }

  return <div ref={root}>
    <div data-dictionary-ignore className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 pt-4 text-xs text-muted md:px-6">
      <p>Bôi đen từ tiếng Anh để tra nghĩa và phát âm.</p>
      <div className="flex gap-2"><button type="button" className={control} onClick={() => { setOpen(true); setTerm(""); setResult(null); setError(""); setNotice(""); setLoading(false); }}>Tra từ</button><DictionaryWordBasket learnerId={learnerId} /></div>
    </div>
    {children}
    {open && createPortal(<div data-dictionary-ignore className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/45 p-3 sm:p-6" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="selection-dictionary-title" tabIndex={-1} className="flex max-h-[min(90dvh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line p-5"><div><h2 id="selection-dictionary-title" className="text-xl font-extrabold">{result?.entry.word || term || "Tra từ"}</h2><p className="mt-1 text-xs text-muted">{result?.scope === "question" ? "Từ vựng trong câu này" : result?.scope === "topic" ? "Từ vựng trong chủ đề" : result?.scope === "library" ? "Từ vựng ngữ pháp" : result ? "Từ điển tham khảo" : "Chọn từ để xem nghĩa"}</p></div><button type="button" aria-label="Đóng tra từ" className={control} onClick={close}>✕</button></header>
        <div className="min-h-0 overflow-y-auto p-5">
          <form data-dictionary-ignore onSubmit={(event) => { event.preventDefault(); void lookup(term); }} className="flex gap-2"><input data-dialog-initial-focus aria-label="Từ tiếng Anh cần tra" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Từ hoặc cụm từ tiếng Anh" maxLength={79} className="min-w-0 flex-1 rounded-xl border border-line bg-surface-soft px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-teal-ink" /><button type="submit" className={control} disabled={loading || !term.trim()}>Tra</button></form>
          {loading && <p role="status" className="mt-5 rounded-xl bg-surface-soft p-4 text-sm text-muted">Đang tra “{term}”…</p>}
          {error && <div role="alert" className="mt-5 rounded-xl border border-line p-4 text-sm text-muted"><p>{error}</p>{term && validTerm(normalizeSelectionWord(term)) && <button className={`${control} mt-3`} type="button" onClick={() => void lookup(term)}>Thử lại</button>}</div>}
          {result && <div className="mt-5 space-y-5">
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => pronounce("us")} className={control}>🔊 Mỹ{result.entry.phoneticUs ? ` /${result.entry.phoneticUs.replace(/^\/|\/$/g, "")}/` : ""}</button><button type="button" onClick={() => pronounce("uk")} className={control}>🔊 Anh{result.entry.phoneticUk ? ` /${result.entry.phoneticUk.replace(/^\/|\/$/g, "")}/` : ""}</button>{!result.entry.phoneticUs && !result.entry.phoneticUk && result.entry.phonetic && <p className="w-full text-sm text-muted">Phiên âm: {result.entry.phonetic}</p>}</div>
            <section className="overflow-hidden rounded-2xl border border-teal-line bg-teal-soft">
              <button type="button" aria-label="Lật thẻ từ vựng" aria-pressed={flipped} onClick={() => setFlipped((value) => !value)} className="flex min-h-36 w-full flex-col items-center justify-center gap-2 p-5 text-center focus-visible:outline-2 focus-visible:outline-teal-ink"><span className="text-xs font-bold text-muted">{flipped ? "Từ tiếng Anh" : "Nghĩa"} · Bấm để lật thẻ</span><strong className="text-xl text-teal-ink">{flipped ? result.entry.word : result.entry.meaning}</strong>{result.entry.partOfSpeech && <span className="text-sm text-muted">{result.entry.partOfSpeech}</span>}</button>
              <div className="border-t border-teal-line p-3"><button type="button" className="min-h-11 w-full rounded-xl bg-teal-ink px-4 py-2.5 text-sm font-extrabold text-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-ink" onClick={() => { const saved = saveDictionaryWord(learnerId, result.entry, context); setNotice(saved.message); }}>＋ Thêm thẻ vào giỏ</button></div>
            </section>
            {result.entry.example && <section><h3 className="text-sm font-extrabold">Ví dụ</h3><p className="mt-2 text-sm leading-relaxed" lang="en">{result.entry.example}</p>{result.entry.exampleTranslation && <p className="mt-1 text-sm leading-relaxed text-muted" lang="vi">{result.entry.exampleTranslation}</p>}</section>}
            {([ ["Cụm từ", result.entry.phrases], ["Đồng nghĩa", result.entry.synonyms], ["Trái nghĩa", result.entry.antonyms] ] as const).filter(([, entries]) => entries.length > 0).map(([title, entries]) => <section key={title}><h3 className="text-sm font-extrabold">{title}</h3><ul className="mt-2 space-y-2 text-sm leading-relaxed">{entries.map((entry, position) => <li key={`${entry.text}-${position}`}><strong>{entry.text}</strong>{entry.meaning && <span className="text-muted"> — {entry.meaning}</span>}</li>)}</ul></section>)}
            {result.entry.wordFamily.length > 0 && <section><h3 className="text-sm font-extrabold">Họ từ</h3><ul className="mt-2 space-y-2 text-sm">{result.entry.wordFamily.map((entry, position) => <li key={`${entry.word}-${position}`}><strong>{entry.word}</strong> {entry.partOfSpeech && `(${entry.partOfSpeech})`}{entry.meaning && <span className="text-muted"> — {entry.meaning}</span>}</li>)}</ul></section>}
            <p className="text-xs leading-relaxed text-muted">Nguồn: {result.entry.source}. {result.scope !== "question" && "Nghĩa tham khảo; hãy đối chiếu với câu đang học."}</p>
          </div>}
          {notice && <p role="status" className="mt-4 rounded-xl bg-surface-soft p-3 text-sm text-muted">{notice}</p>}
        </div>
        <footer className="border-t border-line px-5 py-3 text-xs text-muted">Giỏ từ được lưu trên thiết bị này · {context.title}</footer>
      </div>
    </div>, document.body)}
  </div>;
}
