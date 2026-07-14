"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DictationLessonView } from "@/lib/services/dictation";
import type { DictationAttemptResult, DictationProgressSummary, DictationPrompt, DictationSegmentProgress } from "@/types/dictation";

type Progress = { summary: DictationProgressSummary | null; segments: DictationSegmentProgress[] } | null;
type Mask = 30 | 50 | 100;
type GuestProgress = { index?: number; mask?: Mask; completedIds?: string[]; masteredIds?: string[] };

export default function DictationLessonClient({ lesson, initialProgress, isAuthenticated }: { lesson: DictationLessonView; initialProgress: Progress; isAuthenticated: boolean }) {
  const initialIndex = Math.max(0, Math.min(lesson.segments.length - 1, (initialProgress?.summary?.lastSegmentIndex ?? 1) - 1));
  const guestState = () => {
    if (isAuthenticated || typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem(`englishweb:dictation-progress:v1:${lesson.id}`) ?? "null") as GuestProgress | null; } catch { return null; }
  };
  const [index, setIndex] = useState(() => {
    const saved = guestState();
    return typeof saved?.index === "number" ? Math.max(0, Math.min(lesson.segments.length - 1, saved.index)) : initialIndex;
  });
  const [mask, setMask] = useState<Mask>(() => {
    const saved = guestState();
    return [30, 50, 100].includes(saved?.mask ?? 0) ? saved!.mask! : initialProgress?.summary?.lastMaskPercent ?? 30;
  });
  const [prompt, setPrompt] = useState<DictationPrompt | null>(null);
  const [blankAnswers, setBlankAnswers] = useState<Record<string, string>>({});
  const [blankFeedback, setBlankFeedback] = useState<Record<string, "CORRECT" | "MISSING" | "WRONG">>({});
  const [checkingBlankId, setCheckingBlankId] = useState<string | null>(null);
  const [fullAnswer, setFullAnswer] = useState("");
  const [result, setResult] = useState<DictationAttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [replays, setReplays] = useState(0);
  const [hints, setHints] = useState(0);
  const [rate, setRate] = useState(1);
  const [autoNext, setAutoNext] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const stopTimer = useRef<number | null>(null);
  const activeRef = useRef<DictationLessonView["segments"][number] | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const pendingAutoplayRef = useRef(false);
  const autoAdvanceRef = useRef<number | null>(null);
  const active = lesson.segments[index];
  const loadingPrompt = !prompt || prompt.segmentId !== active?.id || prompt.maskPercent !== mask;
  const progressBySegment = useMemo(() => new Map((initialProgress?.segments ?? []).map((item) => [item.segmentId, item])), [initialProgress]);
  const [completedIds, setCompletedIds] = useState(() => new Set(isAuthenticated ? (initialProgress?.segments ?? []).filter((item) => item.completedAtMillis).map((item) => item.segmentId) : guestState()?.completedIds ?? []));
  const [masteredIds, setMasteredIds] = useState(() => new Set(isAuthenticated ? (initialProgress?.segments ?? []).filter((item) => item.masteredAtMillis).map((item) => item.segmentId) : guestState()?.masteredIds ?? []));

  const playerCommand = useCallback((func: string, args: unknown[] = []) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "https://www.youtube-nocookie.com");
  }, []);

  const clearStopTimer = useCallback(() => {
    if (stopTimer.current) window.clearTimeout(stopTimer.current);
    stopTimer.current = null;
  }, []);

  const pauseSegment = useCallback(() => {
    clearStopTimer();
    playerCommand("pauseVideo");
    setIsPlaying(false);
  }, [clearStopTimer, playerCommand]);

  const playSegment = useCallback((countReplay = true) => {
    if (!active) return;
    clearStopTimer();
    stopAtRef.current = active.endSeconds;
    // YouTube's native endSeconds stops the player at the segment boundary.
    playerCommand("loadVideoById", [{ videoId: lesson.youtubeVideoId, startSeconds: active.startSeconds, endSeconds: active.endSeconds }]);
    playerCommand("setPlaybackRate", [rate]);
    if (countReplay) setReplays((value) => value + 1);
  }, [active, clearStopTimer, lesson.youtubeVideoId, playerCommand, rate]);

  useEffect(() => { activeRef.current = active ?? null; }, [active]);
  useEffect(() => () => clearStopTimer(), [clearStopTimer]);

  useEffect(() => {
    const onPlayerMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frameRef.current?.contentWindow || !["https://www.youtube-nocookie.com", "https://www.youtube.com"].includes(event.origin)) return;
      let data: { event?: string; info?: unknown } | null = null;
      try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data as { event?: string; info?: unknown }; } catch { return; }
      if (!data) return;
      if (data.event === "onStateChange") {
        if (data.info === 1) {
          const segment = activeRef.current;
          if (!segment) return;
          clearStopTimer();
          // Fallback for a player that does not honour endSeconds (for example after buffering).
          stopTimer.current = window.setTimeout(pauseSegment, Math.ceil(((segment.endSeconds - segment.startSeconds) / rate) * 1000) + 350);
          setIsPlaying(true);
        } else if (data.info === 0 || data.info === 2) {
          clearStopTimer();
          setIsPlaying(false);
        }
      }
      const currentTime = (data.info as { currentTime?: unknown } | undefined)?.currentTime;
      if (data.event === "infoDelivery" && typeof currentTime === "number" && stopAtRef.current !== null && currentTime >= stopAtRef.current - 0.05) pauseSegment();
    };
    window.addEventListener("message", onPlayerMessage);
    return () => window.removeEventListener("message", onPlayerMessage);
  }, [clearStopTimer, pauseSegment, rate]);

  const initialisePlayer = useCallback(() => {
    playerCommand("addEventListener", ["onStateChange"]);
    playerCommand("setOption", ["captions", "track", {}]);
  }, [playerCommand]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch(`/api/dictation/lessons/${lesson.id}/segments/${active.id}/prompt?maskPercent=${mask}`)
      .then((response) => response.json())
      .then((response) => { if (!cancelled && response.success) setPrompt(response.data); })
      .catch(() => { if (!cancelled) setPrompt(null); })
    return () => { cancelled = true; };
  }, [active, lesson.id, mask]);

  useEffect(() => {
    const key = `englishweb:dictation-progress:v1:${lesson.id}`;
    if (!isAuthenticated) localStorage.setItem(key, JSON.stringify({ index, mask, completedIds: [...completedIds], masteredIds: [...masteredIds] }));
  }, [completedIds, index, isAuthenticated, lesson.id, mask, masteredIds]);

  const goTo = useCallback((next: number, options?: { autoplay?: boolean }) => {
    const target = Math.max(0, Math.min(lesson.segments.length - 1, next));
    if (autoAdvanceRef.current !== null) {
      window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    pauseSegment();
    pendingAutoplayRef.current = Boolean(options?.autoplay && target !== index);
    setIndex(target);
    setResult(null); setBlankAnswers({}); setBlankFeedback({}); setFullAnswer(""); setHints(0); setReplays(0);
    if (options?.autoplay && target === index) playSegment(false);
  }, [index, lesson.segments.length, pauseSegment, playSegment]);
  const changeMask = useCallback((next: Mask) => { setMask(next); setResult(null); setBlankAnswers({}); setBlankFeedback({}); setFullAnswer(""); setHints(0); }, []);
  const togglePlayback = useCallback(() => { if (isPlaying) pauseSegment(); else playSegment(); }, [isPlaying, pauseSegment, playSegment]);
  const rewindSegment = useCallback(() => { if (!active) return; playerCommand("seekTo", [Math.max(active.startSeconds, active.startSeconds - 3), true]); }, [active, playerCommand]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === " ") { event.preventDefault(); togglePlayback(); }
      if (event.key.toLowerCase() === "r" && event.shiftKey) rewindSegment();
      else if (event.key.toLowerCase() === "r") playSegment();
      if (event.key === "ArrowLeft") goTo(index - 1);
      if (event.key === "ArrowRight") goTo(index + 1);
      if (event.key === "1") changeMask(30);
      if (event.key === "2") changeMask(50);
      if (event.key === "3") changeMask(100);
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [changeMask, goTo, index, playSegment, rewindSegment, togglePlayback]);

  useEffect(() => {
    if (!pendingAutoplayRef.current || !active) return;
    pendingAutoplayRef.current = false;
    playSegment(false);
  }, [active, playSegment]);

  const submit = async () => {
    if (!active || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/dictation/lessons/${lesson.id}/segments/${active.id}/attempt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maskPercent: mask, blankAnswers: mask === 100 ? null : blankAnswers, fullAnswer: mask === 100 ? fullAnswer : null, replayCount: replays, hintCount: hints, elapsedSeconds: 0 }) });
      const body = await response.json();
      if (body.success) {
        setResult(body.data);
        if (prompt?.inputMode === "BLANKS") {
          const blanks = prompt.prompt.filter((token): token is Extract<typeof token, { kind: "blank" }> => token.kind === "blank");
          setBlankFeedback(Object.fromEntries(blanks.map((blank, blankIndex) => [blank.blankId, body.data.feedbackTokens[blankIndex]?.state ?? "MISSING"])));
        }
        if (body.data.isCompleted) setCompletedIds((items) => new Set([...items, active.id]));
        if (body.data.isMastered) setMasteredIds((items) => new Set([...items, active.id]));
        if (body.data.isCompleted && autoNext && index < lesson.segments.length - 1) {
          if (autoAdvanceRef.current !== null) window.clearTimeout(autoAdvanceRef.current);
          autoAdvanceRef.current = window.setTimeout(() => {
            autoAdvanceRef.current = null;
            goTo(index + 1, { autoplay: true });
          }, 850);
        }
      }
    } finally { setSubmitting(false); }
  };

  useEffect(() => () => {
    if (autoAdvanceRef.current !== null) window.clearTimeout(autoAdvanceRef.current);
  }, []);

  const checkBlank = async (blankId: string) => {
    if (!active || mask === 100 || checkingBlankId) return;
    setCheckingBlankId(blankId);
    try {
      const response = await fetch(`/api/dictation/lessons/${lesson.id}/segments/${active.id}/check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maskPercent: mask, blankId, answer: blankAnswers[blankId] ?? "" }),
      });
      const body = await response.json();
      if (body.success) setBlankFeedback((value) => ({ ...value, [blankId]: body.data.state }));
    } finally { setCheckingBlankId(null); }
  };

  const showHint = () => {
    if (!prompt || prompt.inputMode !== "BLANKS") return;
    const blank = prompt.prompt.find((token) => token.kind === "blank" && !blankAnswers[token.blankId]);
    if (blank?.kind === "blank") { setBlankAnswers((value) => ({ ...value, [blank.blankId]: blank.hint })); setBlankFeedback((value) => { const next = { ...value }; delete next[blank.blankId]; return next; }); setHints((value) => value + 1); }
  };

  if (!active) return null;
  const completed = completedIds.has(active.id);
  const finished = completedIds.size === lesson.segments.length;
  const firstIncompleteIndex = lesson.segments.findIndex((segment) => !completedIds.has(segment.id));
  return <main className="min-h-[calc(100dvh-4rem)] bg-[#f3f7fc] px-3 py-4 sm:px-6 lg:px-8">
    <section className="mx-auto max-w-7xl">
      <header className="mb-4 flex flex-wrap items-center gap-3"><Link href="/listen/dictation" className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold text-ink no-underline">← Thư viện</Link><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary">{lesson.level}</span><p className="min-w-0 flex-1 truncate text-sm font-bold text-muted">{lesson.sourceName}</p><a href={lesson.sourceUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary">Video gốc ↗</a></header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5"><article className="overflow-hidden rounded-2xl bg-black shadow-lg"><div className="aspect-video"><iframe ref={frameRef} onLoad={initialisePlayer} title={lesson.title} className="h-full w-full" src={`${lesson.embedUrl}?enablejsapi=1&playsinline=1&rel=0&controls=0&disablekb=1&fs=0&cc_load_policy=0&iv_load_policy=3`} allow="autoplay; encrypted-media; picture-in-picture" /></div></article>
          <article className="rounded-2xl bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-wide text-primary">Đoạn {active.index}/{lesson.segments.length}</p><h1 className="text-xl font-extrabold text-ink">{lesson.title}</h1><p className="mt-1 text-sm font-semibold text-muted">{formatTime(active.startSeconds)} – {formatTime(active.endSeconds)} · Video tự dừng khi hết đoạn</p>{active.speaker && <p className="text-sm text-muted">{active.speaker}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={togglePlayback} className="rounded-xl bg-primary px-4 py-2 text-sm font-extrabold text-gold-ink">{isPlaying ? "❚❚ Dừng" : "▶ Nghe đoạn này"}</button><button type="button" onClick={() => goTo(index + 1, { autoplay: true })} disabled={index >= lesson.segments.length - 1} title="Phát đoạn kế và tự dừng khi hết đoạn" className="rounded-xl border border-cyan-500 px-4 py-2 text-sm font-extrabold text-cyan-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">▶ Nghe tiếp</button><button type="button" onClick={rewindSegment} className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-ink">↶ Đầu đoạn</button><select value={rate} onChange={(event) => { const next = Number(event.target.value); setRate(next); playerCommand("setPlaybackRate", [next]); }} className="rounded-xl border border-line px-3 text-sm font-bold"><option value={0.75}>0.75x</option><option value={1}>1x</option><option value={1.25}>1.25x</option></select></div></div>
            <div className="mt-5 flex flex-wrap gap-2" aria-label="Mức che">{([30, 50, 100] as Mask[]).map((value) => <button key={value} type="button" onClick={() => changeMask(value)} className={`rounded-lg px-3 py-2 text-sm font-extrabold ${mask === value ? "bg-cyan-600 text-white" : "bg-slate-100 text-ink"}`}>Che {value}%</button>)}</div>
            <div className="mt-5 rounded-xl border border-line bg-slate-50 p-4">{loadingPrompt ? <p className="text-muted">Đang chuẩn bị câu nghe...</p> : prompt?.inputMode === "FULL_TEXT" ? <textarea value={fullAnswer} onChange={(event) => setFullAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="Nghe và gõ toàn bộ câu..." rows={4} className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-base outline-none focus:ring-2 focus:ring-cyan-500" autoFocus /> : <div className="flex flex-wrap items-center gap-x-1 gap-y-3">{prompt?.prompt.map((token, tokenIndex) => token.kind === "blank" ? <span key={token.blankId} className="inline-flex items-center gap-1"><input value={blankAnswers[token.blankId] ?? ""} onChange={(event) => { const blankId = token.blankId; setBlankAnswers((value) => ({ ...value, [blankId]: event.target.value.replace(/^_+/, "") })); setBlankFeedback((value) => { const next = { ...value }; delete next[blankId]; return next; }); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); checkBlank(token.blankId); } }} style={{ width: `${Math.max(72, token.length * 12)}px` }} className={`h-9 rounded-lg border bg-white px-2 text-center outline-none focus:ring-2 focus:ring-cyan-500 ${blankFeedback[token.blankId] === "CORRECT" ? "border-emerald-500" : blankFeedback[token.blankId] === "WRONG" ? "border-red-500" : blankFeedback[token.blankId] === "MISSING" ? "border-amber-500" : "border-cyan-300"}`} aria-label="Điền từ còn thiếu" /><button type="button" onClick={() => checkBlank(token.blankId)} disabled={checkingBlankId !== null} title="Kiểm tra ô này" className="rounded-md border border-line bg-white px-2 py-1 text-xs font-extrabold text-ink disabled:opacity-50">{checkingBlankId === token.blankId ? "..." : "✓"}</button></span> : <span key={`${token.kind}-${tokenIndex}`} className={token.kind === "text" ? "font-semibold text-ink" : "whitespace-pre-wrap"}>{token.value}</span>)}</div>}</div>
            <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={submit} disabled={submitting || loadingPrompt} className="rounded-xl bg-ink px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{submitting ? "Đang chấm..." : mask === 100 ? "Kiểm tra toàn bộ (Enter)" : "Kiểm tra tất cả ô"}</button>{mask !== 100 && <><span className="text-xs font-semibold text-muted">Ấn ✓ cạnh mỗi ô để kiểm tra riêng.</span><button type="button" onClick={showHint} className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-ink">Gợi ý</button></>}<button type="button" onClick={() => setAutoNext((value) => !value)} className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${autoNext ? "border-cyan-500 bg-cyan-50 text-cyan-800" : "border-line text-ink"}`}>Tự động tiếp: {autoNext ? "Bật" : "Tắt"}</button>{completed && <span className="text-sm font-bold text-emerald-700">✓ Đã hoàn thành</span>}</div>
            {result && <Feedback result={result} />}</article>
        </section>
        <aside className="rounded-2xl bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="font-extrabold text-ink">Tiến độ</h2><span className="text-sm font-bold text-primary">{completedIds.size}/{lesson.segments.length}</span></div><p className="mb-3 text-xs text-muted">Chọn đoạn để phát ngay từ đầu đoạn.</p><div className="max-h-[65dvh] space-y-2 overflow-y-auto pr-1">{lesson.segments.map((segment, segmentIndex) => { const item = progressBySegment.get(segment.id); const activeClass = segmentIndex === index ? "border-cyan-500 bg-cyan-50" : "border-transparent bg-slate-50 hover:bg-slate-100"; return <button type="button" key={segment.id} onClick={() => goTo(segmentIndex, { autoplay: true })} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${activeClass}`}><span className={`h-3 w-3 shrink-0 rounded-full ${masteredIds.has(segment.id) || item?.masteredAtMillis ? "bg-emerald-500" : completedIds.has(segment.id) || item?.completedAtMillis ? "bg-cyan-500" : "bg-slate-300"}`} /><span className="min-w-0 flex-1"><b className="block text-sm text-ink">#{segment.index}</b><span className="text-xs text-muted">{formatTime(segment.startSeconds)} – {formatTime(segment.endSeconds)}</span></span></button>; })}</div></aside>
      </div>
      {finished && <section className="mx-auto mt-5 max-w-3xl rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center"><p className="text-lg font-extrabold text-emerald-900">Bạn đã hoàn thành toàn bộ video</p><p className="mt-1 text-sm text-emerald-800">Đã thành thạo {masteredIds.size}/{lesson.segments.length} đoạn ở mức che 100% không dùng gợi ý.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => goTo(0)} className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-900">Ôn lại từ đầu</button><Link href="/listen/dictation" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white no-underline">Về thư viện</Link></div></section>}
      {!finished && firstIncompleteIndex >= 0 && completedIds.size > 0 && <p className="mt-4 text-center text-xs text-muted">Còn {lesson.segments.length - completedIds.size} đoạn. Bạn có thể chọn bất kỳ đoạn nào trong danh sách để tiếp tục.</p>}
      <p className="mt-5 text-center text-xs text-muted">{lesson.publicAttribution}</p>
    </section>
  </main>;
}

function Feedback({ result }: { result: DictationAttemptResult }) { return <div className={`mt-5 rounded-xl border p-4 ${result.isCompleted ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><p className="font-extrabold text-ink">{result.isCompleted ? "Chính xác!" : `Bạn đạt ${result.scorePercent}%`}{result.isMastered && " · Đã thành thạo"}</p><p className="mt-2 whitespace-pre-wrap text-sm text-ink"><b>Đáp án:</b> {result.expectedText}</p><div className="mt-3 flex flex-wrap gap-2">{result.feedbackTokens.map((token, index) => <span key={`${token.value}-${index}`} className={`rounded-md px-2 py-1 text-xs font-bold ${token.state === "CORRECT" ? "bg-emerald-200 text-emerald-900" : token.state === "MISSING" ? "bg-amber-200 text-amber-900" : "bg-red-200 text-red-900"}`}>{token.value}</span>)}</div><p className="mt-4 text-sm font-bold text-muted">Bạn có thể bấm <span className="rounded bg-white px-1.5 py-0.5">Nghe tiếp</span> để chuyển và phát đoạn kế.</p></div>; }
function formatTime(seconds: number) { const minutes = Math.floor(seconds / 60); return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
