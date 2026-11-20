"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SelectionDictionary from "@/components/SelectionDictionary";
import type { DictationCatalog, DictationSet } from "@/lib/storage/dictation-snapshot";
import { buildPrompt, gradeDictationAttempt, type MaskPercent } from "@/lib/services/dictation-grading";

type LocalProgress = { index: number; completed: string[] };
const button = "rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold text-ink disabled:opacity-40";

export function readAudioDictationProgress(raw: string | null, session: DictationSet): LocalProgress {
  try {
    const value = JSON.parse(raw || "null");
    if (!value || !Number.isInteger(value.index) || value.index < 0 || value.index >= session.items.length || !Array.isArray(value.completed)) return { index: 0, completed: [] };
    const ids = new Set(session.items.filter(item => item.transcript.trim()).map(item => item.id));
    return { index: value.index, completed: [...new Set(value.completed.filter((id: unknown): id is string => typeof id === "string" && ids.has(id)))] as string[] };
  } catch { return { index: 0, completed: [] }; }
}

export default function AudioDictationClient({ set, session, learnerId }: { set: DictationCatalog["sets"][number]; session: DictationSet; learnerId: string }) {
  const storageKey = `englishweb:audio-dictation:v1:${learnerId}:${set.id}`;
  const [progress, setProgress] = useState<LocalProgress>({ index: 0, completed: [] });
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [mask, setMask] = useState<MaskPercent>(100);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [answer, setAnswer] = useState("");
  const [blanks, setBlanks] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReturnType<typeof gradeDictationAttempt> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const item = session.items[progress.index];
  const vocabularyPool = useMemo(() => session.items.map((entry) => entry.vocabulary), [session.items]);
  const hasTranscript = !!item.transcript.trim();
  const availableCount = session.items.filter(item => item.transcript.trim()).length;
  const prompt = buildPrompt(item.id, item.transcript, mask);

  useEffect(() => {
    // Hydrate browser-only progress after the server-rendered initial state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setProgress(readAudioDictationProgress(localStorage.getItem(storageKey), session)); }
    catch { setStorageAvailable(false); }
    setReady(true);
  }, [storageKey, session]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storageKey, JSON.stringify(progress)); }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    catch { setStorageAvailable(false); }
  }, [ready, progress, storageKey]);

  const replayAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.playbackRate = playbackRate;
    void audio.play().catch(() => undefined);
  }, [playbackRate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.code === "Space") {
        event.preventDefault();
        replayAudio();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [replayAudio]);

  function clearAnswer() { setAnswer(""); setBlanks({}); setResult(null); }
  function move(index: number) { clearAnswer(); setProgress(value => ({ ...value, index })); }
  function check() {
    if (!hasTranscript) return;
    const graded = gradeDictationAttempt({ segmentId: item.id, expectedText: item.transcript, acceptedNormalizedAnswers: [], maskPercent: mask, blankAnswers: blanks, fullAnswer: answer });
    setResult(graded);
    if (graded.scorePercent === 100 && mask === 100) setProgress(value => ({ ...value, completed: [...new Set([...value.completed, item.id])] }));
  }
  function giveHint() {
    if (!hasTranscript) return;
    if (mask === 100) {
      const expectedWords = item.transcript.trim().split(/\s+/).filter(Boolean);
      const currentWords = answer.trim() ? answer.trim().split(/\s+/).filter(Boolean) : [];
      if (currentWords.length < expectedWords.length) {
        const nextWord = expectedWords[currentWords.length];
        setAnswer(currentWords.length > 0 ? `${answer.trim()} ${nextWord} ` : `${nextWord} `);
      }
      return;
    }
    const nextBlank = prompt.prompt.find((token) => token.kind === "blank" && !blanks[token.blankId]);
    if (nextBlank?.kind === "blank") {
      setBlanks((prev) => ({ ...prev, [nextBlank.blankId]: nextBlank.hint }));
    }
  }
  return <SelectionDictionary
    learnerId={learnerId}
    vocabulary={item.vocabulary}
    vocabularyPool={vocabularyPool}
    context={{
      id: item.id,
      title: `Nghe chép · ${set.subtitle || set.name}`,
      sentence: item.transcript,
    }}
  ><main className="mx-auto max-w-3xl px-4 py-8">
    <Link href="/listen/audio-dictation" className="text-sm font-bold text-primary">← Thư viện nghe chép</Link>
    <h1 className="mt-5 text-2xl font-extrabold text-ink">{set.subtitle || set.name}</h1>
    <p className="mt-2 text-sm text-muted">{set.collectionName} · {set.chapterName} · Câu {progress.index + 1}/{session.items.length}</p>
    <p className="mt-2 text-xs text-muted" role="status">{storageAvailable ? `Tiến độ trên thiết bị này: ${progress.completed.length}/${availableCount} câu đã chép đúng.` : "Trình duyệt không lưu được tiến độ trên thiết bị này."}</p>
    {availableCount < session.items.length && <p className="mt-2 text-xs text-muted">{session.items.length - availableCount} câu chưa có bản chép từ nguồn; vẫn có thể nghe âm thanh.</p>}

    {session.items.length > 1 && (
      <div className="mt-4 flex flex-wrap gap-1.5" role="navigation" aria-label="Danh sách câu nghe chép">
        {session.items.map((entry, idx) => {
          const isCurrent = idx === progress.index;
          const isDone = progress.completed.includes(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => move(idx)}
              disabled={!ready}
              aria-current={isCurrent ? "step" : undefined}
              className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${
                isCurrent
                  ? "bg-primary text-gold-ink"
                  : isDone
                    ? "border border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              #{idx + 1}{isDone ? " ✓" : ""}
            </button>
          );
        })}
      </div>
    )}

    <section className="mt-5 rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <audio
        ref={audioRef}
        key={item.id}
        src={item.audioUrl}
        controls
        preload="metadata"
        className="w-full"
        aria-label={`Âm thanh câu ${progress.index + 1}`}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={replayAudio} className={button} title="Phím tắt: Ctrl + Space">
            ↺ Nghe lại
          </button>
          <select
            aria-label="Tốc độ phát"
            value={playbackRate}
            onChange={(event) => {
              const rate = Number(event.target.value);
              setPlaybackRate(rate);
              if (audioRef.current) audioRef.current.playbackRate = rate;
            }}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-ink"
          >
            <option value={0.75}>0.75x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
          </select>
        </div>
        <span className="text-xs text-muted">Phím tắt: Ctrl + Space nghe lại · Enter kiểm tra</span>
      </div>
      {!hasTranscript && <p className="mt-4 rounded-xl bg-warning-soft p-4 text-warning-ink">Nguồn chưa có bản chép cho câu này. Bạn có thể nghe và chuyển sang câu tiếp theo; câu này không được chấm điểm.</p>}
      <label className="mt-5 flex items-center gap-3 text-sm font-bold text-ink">Mức che<select value={mask} onChange={event => { setMask(Number(event.target.value) as MaskPercent); clearAnswer(); }} className="rounded-lg border border-line bg-surface px-3 py-2"><option value={30}>30% · Điền từ</option><option value={50}>50% · Điền từ</option><option value={100}>100% · Nghe chép</option></select></label>
      <form onSubmit={event => { event.preventDefault(); check(); }}>
        {mask === 100 ? (
          <label className="mt-5 block text-sm font-bold text-ink">
            Chép câu bạn nghe
            <textarea
              aria-label="Câu bạn nghe"
              value={answer}
              onChange={event => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  check();
                }
              }}
              className="mt-2 min-h-32 w-full rounded-xl border border-line bg-surface p-3 font-normal"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        ) : (
          <div className="mt-5 whitespace-pre-wrap leading-10 text-ink">
            {prompt.prompt.map((token, index) => token.kind === "blank" ? <input key={token.blankId} aria-label={`Từ trống ${token.blankId}`} value={blanks[token.blankId] || ""} onChange={event => setBlanks(value => ({ ...value, [token.blankId]: event.target.value }))} className="mx-1 rounded-lg border border-line bg-surface px-2 py-1" style={{ width: `${Math.max(5, Math.min(16, token.length + 2))}ch` }} autoComplete="off" spellCheck={false} /> : <span key={index}>{token.value}</span>)}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button disabled={!ready || !hasTranscript} className="rounded-xl bg-primary px-5 py-2.5 font-bold text-gold-ink disabled:opacity-40">Kiểm tra</button>
          <button type="button" disabled={!ready || !hasTranscript} onClick={giveHint} className={button}>Gợi ý</button>
        </div>
      </form>
      {result && <div className="mt-5 rounded-xl border border-line p-4" aria-live="polite"><p className="font-bold text-ink">{result.scorePercent === 100 ? "Chính xác!" : `Bạn đạt ${result.scorePercent}%`}</p><p className="mt-3 text-ink">{item.transcript}</p>{item.translationVi && <p className="mt-2 text-muted">{item.translationVi}</p>}<div className="mt-3 flex flex-wrap gap-2">{result.feedbackTokens.map((token, index) => <span key={index} className={`rounded px-2 py-1 text-sm ${token.state === "CORRECT" ? "bg-success-soft text-success-ink" : "bg-warning-soft text-warning-ink"}`}>{token.value}</span>)}</div><button onClick={clearAnswer} className={`${button} mt-4`}>Thử lại</button></div>}
    </section>
    <div className="mt-5 flex items-center justify-between gap-3"><button className={button} disabled={!ready || progress.index === 0} onClick={() => move(progress.index - 1)}>← Câu trước</button><button className={button} disabled={!ready || progress.index === session.items.length - 1} onClick={() => move(progress.index + 1)}>Câu tiếp →</button></div>
    {availableCount > 0 && progress.completed.length === availableCount && <p className="mt-5 rounded-xl bg-success-soft p-4 font-bold text-success-ink">Bạn đã chép đúng toàn bộ câu có bản chép trong bộ này.</p>}
  </main></SelectionDictionary>;
}
