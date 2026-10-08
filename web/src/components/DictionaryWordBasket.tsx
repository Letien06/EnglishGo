"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useDialogFocus from "./useDialogFocus";
import { findBestEnglishVoice } from "@/lib/vocab-speech";
import { DICTIONARY_BASKET_EVENT, dictionaryBasketStorageKey, loadDictionaryBasket, type DictionaryBasketRead } from "@/lib/dictionary-word-basket";

const button = "min-h-10 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-ink";
export default function DictionaryWordBasket({ learnerId }: { learnerId: string }) {
  const [basket, setBasket] = useState<DictionaryBasketRead | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "card">("list");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [speechStatus, setSpeechStatus] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLButtonElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const stopSpeech = useCallback(() => {
    const utterance = utteranceRef.current;
    if (!utterance) return;
    utteranceRef.current = null;
    utterance.onend = null; utterance.onerror = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);
  const close = useCallback(() => { stopSpeech(); setOpen(false); }, [stopSpeech]);
  useDialogFocus(open, close, dialogRef);
  useEffect(() => () => stopSpeech(), [learnerId, stopSpeech]);
  useEffect(() => {
    const refresh = () => setBasket(loadDictionaryBasket(learnerId));
    const changed = (event: Event) => { if ((event as CustomEvent<{ learnerId: string }>).detail?.learnerId === learnerId) refresh(); };
    const stored = (event: StorageEvent) => { if (event.key === null || event.key === dictionaryBasketStorageKey(learnerId)) refresh(); };
    // Read only this learner's device basket after hydration.
    refresh();
    window.addEventListener(DICTIONARY_BASKET_EVENT, changed);
    window.addEventListener("storage", stored);
    window.addEventListener("pageshow", refresh);
    return () => { window.removeEventListener(DICTIONARY_BASKET_EVENT, changed); window.removeEventListener("storage", stored); window.removeEventListener("pageshow", refresh); };
  }, [learnerId]);
  useEffect(() => { if (open && mode === "card") flipRef.current?.focus(); }, [mode, open]);
  const items = basket?.status === "ready" ? basket.items : [];
  const active = items[Math.min(index, Math.max(0, items.length - 1))];
  function selectCard(next: number) { stopSpeech(); setIndex(next); setFlipped(false); setSpeechStatus(""); setMode("card"); }
  function hear() {
    if (!active) return;
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") { setSpeechStatus("Thiết bị này chưa hỗ trợ đọc từ bằng giọng nói."); return; }
    try {
      stopSpeech();
      const utterance = new SpeechSynthesisUtterance(active.entry.word);
      const voice = findBestEnglishVoice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? "en-US";
      utteranceRef.current = utterance;
      utterance.onend = () => { if (utteranceRef.current === utterance) utteranceRef.current = null; };
      utterance.onerror = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null; setSpeechStatus("Không thể phát giọng đọc. Vui lòng thử lại.");
      };
      window.speechSynthesis.speak(utterance); setSpeechStatus("");
    } catch { utteranceRef.current = null; setSpeechStatus("Không thể phát giọng đọc. Vui lòng thử lại."); }
  }
  const knownCount = basket?.status === "ready" ? basket.items.length : null;
  return <>
    <button type="button" className={button} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setBasket(loadDictionaryBasket(learnerId)); setMode("list"); setOpen(true); }}>Giỏ từ <span className="tabular-nums">({knownCount ?? "—"})</span></button>
    {open && createPortal(<div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/40 p-3 sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dictionary-basket-title" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-xl sm:p-6">
        <header className="flex items-start justify-between gap-4"><div><h2 id="dictionary-basket-title" className="text-xl font-extrabold text-ink">Giỏ từ của bạn</h2><p className="mt-1 text-sm text-muted">Lưu trên thiết bị này</p></div><button type="button" data-dialog-initial-focus aria-label="Đóng giỏ từ" className={button} onClick={close}>×</button></header>
        {!basket || basket.status !== "ready" ? <p role="status" className="mt-5 text-sm text-muted">{basket?.message ?? "Đang đọc giỏ từ…"}</p> : !items.length ? <p className="mt-6 rounded-xl bg-surface-soft p-5 text-sm leading-relaxed text-muted">Giỏ từ đang trống. Chọn một từ trong bài ngữ pháp rồi chọn “Thêm thẻ vào giỏ”.</p> : <>
          <nav aria-label="Chế độ xem giỏ từ" className="mt-5 flex gap-2"><button type="button" className={button} aria-pressed={mode === "list"} onClick={() => { stopSpeech(); setMode("list"); }}>Danh sách ({items.length})</button><button type="button" className={button} aria-pressed={mode === "card"} onClick={() => selectCard(Math.min(index, items.length - 1))}>Ôn thẻ</button></nav>
          <div className="mt-4 min-h-0 overflow-y-auto">
            {mode === "list" ? <ul className="space-y-2">{items.map((item, itemIndex) => <li key={item.id}><button type="button" className="w-full rounded-xl border border-line p-4 text-left focus-visible:outline-2 focus-visible:outline-teal-ink" onClick={() => selectCard(itemIndex)}><span className="font-extrabold text-ink">{item.entry.word}</span>{(item.entry.phoneticUs || item.entry.phonetic || item.entry.phoneticUk) && <span className="ml-2 text-sm text-muted">{item.entry.phoneticUs || item.entry.phonetic || item.entry.phoneticUk}</span>}<span className="mt-1 block text-sm text-muted">{item.entry.meaning}</span><span className="mt-2 block text-xs text-teal-ink">Ôn từ này →</span></button></li>)}</ul> : active && <>
              <section className="min-h-64 rounded-2xl border border-teal-line bg-teal-soft p-5 text-center" aria-live="polite">
                <p className="text-xs font-bold text-muted">Thẻ {Math.min(index, items.length - 1) + 1}/{items.length}</p><h3 className="mt-4 text-3xl font-extrabold text-ink">{active.entry.word}</h3>
                <p className="mt-2 text-sm text-muted">{active.entry.partOfSpeech}{active.entry.phoneticUs || active.entry.phonetic || active.entry.phoneticUk ? ` · ${active.entry.phoneticUs || active.entry.phonetic || active.entry.phoneticUk}` : ""}</p>
                <button type="button" className={`${button} mt-4`} onClick={hear}>Nghe phát âm</button>
                {flipped && <div className="mt-5 space-y-3 text-left"><p className="font-bold text-ink">{active.entry.meaning}</p>{active.entry.example && <p className="text-sm leading-relaxed text-ink" lang="en">{active.entry.example}</p>}{active.entry.exampleTranslation && <p className="text-sm leading-relaxed text-muted" lang="vi">{active.entry.exampleTranslation}</p>}{active.contexts.map((context, contextIndex) => <div key={`${context.id}:${contextIndex}`} className="rounded-xl bg-surface p-3"><p className="text-xs font-bold text-muted">{context.title}</p><p className="mt-1 text-sm leading-relaxed text-ink" lang="en">{context.sentence}</p></div>)}</div>}
              </section>
              <button ref={flipRef} type="button" aria-pressed={flipped} className={`${button} mt-3 w-full`} onClick={() => setFlipped((value) => !value)}>{flipped ? "Ẩn nghĩa" : "Hiện nghĩa và ví dụ"}</button>
              <nav aria-label="Chuyển thẻ" className="mt-3 flex justify-between gap-3"><button type="button" className={button} disabled={index === 0} onClick={() => selectCard(index - 1)}>← Thẻ trước</button><button type="button" className={button} disabled={index >= items.length - 1} onClick={() => selectCard(index + 1)}>Thẻ tiếp →</button></nav>
              {speechStatus && <p role="status" className="mt-3 text-sm text-muted">{speechStatus}</p>}
            </>}
          </div>
        </>}
      </div>
    </div>, document.body)}
  </>;
}
