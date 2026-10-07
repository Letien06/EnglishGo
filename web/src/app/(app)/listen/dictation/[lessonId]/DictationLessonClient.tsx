"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DictationLessonView } from "@/lib/services/dictation";
import type { DictationAttemptResult, DictationProgressSummary, DictationPrompt, DictationSegmentProgress } from "@/types/dictation";

type Progress = { summary: DictationProgressSummary | null; segments: DictationSegmentProgress[] } | null;
type Mask = 30 | 50 | 100;
type GuestProgress = { index?: number; mask?: Mask; completedIds?: string[]; masteredIds?: string[] };

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body.success || body.data == null) throw new Error(body.error || "Không thể kết nối. Vui lòng thử lại.");
        return body.data as T;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại."));
          controller.abort();
        }, 20_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptRetry, setPromptRetry] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const viewGeneration = useRef(0);
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
    requestData<DictationPrompt>(`/api/dictation/lessons/${lesson.id}/segments/${active.id}/prompt?maskPercent=${mask}`)
      .then((data) => { if (!cancelled) { setPrompt(data); setPromptError(null); } })
      .catch((reason: unknown) => { if (!cancelled) setPromptError(reason instanceof Error ? reason.message : "Không thể tải câu nghe. Vui lòng thử lại."); });
    return () => { cancelled = true; };
  }, [active, lesson.id, mask, promptRetry]);

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
    viewGeneration.current += 1;
    setSubmitting(false); setCheckingBlankId(null); setActionError(null); setPromptError(null);
    if (target === index && loadingPrompt) setPromptRetry((value) => value + 1);
    pendingAutoplayRef.current = Boolean(options?.autoplay && target !== index);
    setIndex(target);
    setResult(null); setBlankAnswers({}); setBlankFeedback({}); setFullAnswer(""); setHints(0); setReplays(0);
    if (options?.autoplay && target === index) playSegment(false);
  }, [index, lesson.segments.length, loadingPrompt, pauseSegment, playSegment]);
  const changeMask = useCallback((next: Mask) => {
    if (next === mask) return;
    viewGeneration.current += 1;
    if (autoAdvanceRef.current !== null) window.clearTimeout(autoAdvanceRef.current);
    autoAdvanceRef.current = null;
    setSubmitting(false); setCheckingBlankId(null); setActionError(null); setPromptError(null);
    setMask(next); setResult(null); setBlankAnswers({}); setBlankFeedback({}); setFullAnswer(""); setHints(0);
  }, [mask]);
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
    if (!active || submitting || loadingPrompt) return;
    const generation = viewGeneration.current;
    setSubmitting(true);
    setActionError(null);
    try {
      const data = await requestData<DictationAttemptResult>(`/api/dictation/lessons/${lesson.id}/segments/${active.id}/attempt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maskPercent: mask, blankAnswers: mask === 100 ? null : blankAnswers, fullAnswer: mask === 100 ? fullAnswer : null, replayCount: replays, hintCount: hints, elapsedSeconds: 0 }) });
      if (data.isCompleted) setCompletedIds((items) => new Set([...items, active.id]));
      if (data.isMastered) setMasteredIds((items) => new Set([...items, active.id]));
      if (generation === viewGeneration.current) {
        setResult(data);
        if (prompt?.inputMode === "BLANKS") {
          const blanks = prompt.prompt.filter((token): token is Extract<typeof token, { kind: "blank" }> => token.kind === "blank");
          setBlankFeedback(Object.fromEntries(blanks.map((blank, blankIndex) => [blank.blankId, data.feedbackTokens[blankIndex]?.state === "CORRECT" ? "CORRECT" : data.feedbackTokens[blankIndex]?.state === "MISSING" ? "MISSING" : "WRONG"])));
        }
        if (data.isCompleted && autoNext && index < lesson.segments.length - 1) {
          if (autoAdvanceRef.current !== null) window.clearTimeout(autoAdvanceRef.current);
          autoAdvanceRef.current = window.setTimeout(() => {
            autoAdvanceRef.current = null;
            if (generation === viewGeneration.current) goTo(index + 1, { autoplay: true });
          }, 850);
        }
      }
    } catch (reason) {
      if (generation === viewGeneration.current) setActionError(reason instanceof Error ? reason.message : "Không thể chấm câu nghe. Vui lòng thử lại.");
    } finally { if (generation === viewGeneration.current) setSubmitting(false); }
  };

  useEffect(() => () => {
    viewGeneration.current += 1;
    if (autoAdvanceRef.current !== null) window.clearTimeout(autoAdvanceRef.current);
  }, []);

  const checkBlank = async (blankId: string) => {
    if (!active || mask === 100 || checkingBlankId || loadingPrompt) return;
    const generation = viewGeneration.current;
    setCheckingBlankId(blankId);
    setActionError(null);
    try {
      const data = await requestData<{ state: "CORRECT" | "MISSING" | "WRONG" }>(`/api/dictation/lessons/${lesson.id}/segments/${active.id}/check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maskPercent: mask, blankId, answer: blankAnswers[blankId] ?? "" }),
      });
      if (generation === viewGeneration.current) setBlankFeedback((value) => ({ ...value, [blankId]: data.state }));
    } catch (reason) {
      if (generation === viewGeneration.current) setActionError(reason instanceof Error ? reason.message : "Không thể kiểm tra ô này. Vui lòng thử lại.");
    } finally { if (generation === viewGeneration.current) setCheckingBlankId(null); }
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
  return <main className="min-h-[calc(100dvh-4rem)] bg-bg px-3 py-4 sm:px-6 lg:px-8">
    <section className="mx-auto max-w-7xl">
      <header className="mb-4 flex flex-wrap items-center gap-3"><Link href="/listen/dictation" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-ink no-underline">← Thư viện</Link><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary">{lesson.level}</span><p className="min-w-0 flex-1 truncate text-sm font-bold text-muted">{lesson.sourceName}</p><a href={lesson.sourceUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary">Video gốc ↗</a></header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5"><article className="overflow-hidden rounded-2xl bg-black shadow-lg"><div className="aspect-video"><iframe ref={frameRef} onLoad={initialisePlayer} title={lesson.title} className="h-full w-full" src={`${lesson.embedUrl}?enablejsapi=1&playsinline=1&rel=0&controls=0&disablekb=1&fs=0&cc_load_policy=0&iv_load_policy=3`} allow="autoplay; encrypted-media; picture-in-picture" /></div></article>
          <article className="rounded-2xl bg-surface p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-wide text-primary">Đoạn {active.index}/{lesson.segments.length}</p><h1 className="text-xl font-extrabold text-ink">{lesson.title}</h1><p className="mt-1 text-sm font-semibold text-muted">{formatTime(active.startSeconds)} – {formatTime(active.endSeconds)} · Video tự dừng khi hết đoạn</p>{active.speaker && <p className="text-sm text-muted">{active.speaker}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={togglePlayback} className="rounded-xl bg-primary px-4 py-2 text-sm font-extrabold text-gold-ink">{isPlaying ? "❚❚ Dừng" : "▶ Nghe đoạn này"}</button><button type="button" onClick={() => goTo(index + 1, { autoplay: true })} disabled={index >= lesson.segments.length - 1} title="Phát đoạn kế và tự dừng khi hết đoạn" className="rounded-xl border border-teal-line px-4 py-2 text-sm font-extrabold text-teal-ink disabled:cursor-not-allowed disabled:border-line disabled:text-muted">▶ Nghe tiếp</button><button type="button" onClick={rewindSegment} className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-ink">↶ Đầu đoạn</button><select value={rate} onChange={(event) => { const next = Number(event.target.value); setRate(next); playerCommand("setPlaybackRate", [next]); }} className="rounded-xl border border-line px-3 text-sm font-bold"><option value={0.75}>0.75x</option><option value={1}>1x</option><option value={1.25}>1.25x</option></select></div></div>
            <div className="mt-5 flex flex-wrap gap-2" aria-label="Mức che">{([30, 50, 100] as Mask[]).map((value) => <button key={value} type="button" onClick={() => changeMask(value)} className={`rounded-lg px-3 py-2 text-sm font-extrabold ${mask === value ? "bg-teal-soft text-teal-ink" : "bg-surface-soft text-ink"}`}>Che {value}%</button>)}</div>
            <div className="mt-5 rounded-xl border border-line bg-surface-soft p-4">{loadingPrompt ? promptError ? <div role="alert"><p className="text-sm font-semibold text-danger-ink">{promptError}</p><button type="button" onClick={() => { setPromptError(null); setPromptRetry((value) => value + 1); }} className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-bold text-ink">Tải lại câu nghe</button></div> : <p className="text-muted">Đang chuẩn bị câu nghe...</p> : prompt?.inputMode === "FULL_TEXT" ? <textarea value={fullAnswer} onChange={(event) => setFullAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="Nghe và gõ toàn bộ câu..." rows={4} className="w-full resize-y rounded-xl border border-control-line bg-surface p-3 text-base outline-none focus:ring-2 focus:ring-teal-line" autoFocus /> : <div className="flex flex-wrap items-center gap-x-1 gap-y-3">{prompt?.prompt.map((token, tokenIndex) => token.kind === "blank" ? <span key={token.blankId} className="inline-flex items-center gap-1"><input value={blankAnswers[token.blankId] ?? ""} onChange={(event) => { const blankId = token.blankId; setBlankAnswers((value) => ({ ...value, [blankId]: event.target.value.replace(/^_+/, "") })); setBlankFeedback((value) => { const next = { ...value }; delete next[blankId]; return next; }); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); checkBlank(token.blankId); } }} style={{ width: `${Math.max(72, token.length * 12)}px` }} className={`h-9 rounded-lg border bg-surface px-2 text-center outline-none focus:ring-2 focus:ring-teal-line ${blankFeedback[token.blankId] === "CORRECT" ? "border-success-line" : blankFeedback[token.blankId] === "WRONG" ? "border-danger-line" : blankFeedback[token.blankId] === "MISSING" ? "border-warning-line" : "border-teal-line"}`} aria-label="Điền từ còn thiếu" /><button type="button" onClick={() => checkBlank(token.blankId)} disabled={checkingBlankId !== null} title="Kiểm tra ô này" className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-extrabold text-ink disabled:opacity-50">{checkingBlankId === token.blankId ? "..." : "✓"}</button></span> : <span key={`${token.kind}-${tokenIndex}`} className={token.kind === "text" ? "font-semibold text-ink" : "whitespace-pre-wrap"}>{token.value}</span>)}</div>}</div>
            <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={submit} disabled={submitting || loadingPrompt} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-extrabold text-gold-ink disabled:opacity-50">{submitting ? "Đang chấm..." : mask === 100 ? "Kiểm tra toàn bộ (Enter)" : "Kiểm tra tất cả ô"}</button>{mask !== 100 && <><span className="text-xs font-semibold text-muted">Ấn ✓ cạnh mỗi ô để kiểm tra riêng.</span><button type="button" onClick={showHint} className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-ink">Gợi ý</button></>}<button type="button" onClick={() => setAutoNext((value) => !value)} className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${autoNext ? "border-teal-line bg-teal-soft text-teal-ink" : "border-line text-ink"}`}>Tự động tiếp: {autoNext ? "Bật" : "Tắt"}</button>{completed && <span className="text-sm font-bold text-success-ink">✓ Đã hoàn thành</span>}</div>
            {actionError && <p role="alert" className="mt-4 rounded-xl border border-danger-line bg-danger-soft p-3 text-sm font-semibold text-danger-ink">{actionError} Câu trả lời vẫn được giữ lại; bạn có thể bấm kiểm tra để thử lại.</p>}{result && <Feedback result={result} />}</article>
        </section>
        <aside className="rounded-2xl bg-surface p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="font-extrabold text-ink">Tiến độ</h2><span className="text-sm font-bold text-primary">{completedIds.size}/{lesson.segments.length}</span></div><p className="mb-3 text-xs text-muted">Chọn đoạn để phát ngay từ đầu đoạn.</p><div className="max-h-[65dvh] space-y-2 overflow-y-auto pr-1">{lesson.segments.map((segment, segmentIndex) => { const item = progressBySegment.get(segment.id); const activeClass = segmentIndex === index ? "border-teal-line bg-teal-soft" : "border-transparent bg-surface-soft hover:bg-surface-soft"; return <button type="button" key={segment.id} onClick={() => goTo(segmentIndex, { autoplay: true })} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${activeClass}`}><span className={`h-3 w-3 shrink-0 rounded-full ${masteredIds.has(segment.id) || item?.masteredAtMillis ? "bg-success-soft0" : completedIds.has(segment.id) || item?.completedAtMillis ? "bg-teal-soft0" : "bg-control-line"}`} /><span className="min-w-0 flex-1"><b className="block text-sm text-ink">#{segment.index}</b><span className="text-xs text-muted">{formatTime(segment.startSeconds)} – {formatTime(segment.endSeconds)}</span></span></button>; })}</div></aside>
      </div>
      {finished && <section className="mx-auto mt-5 max-w-3xl rounded-2xl border border-success-line bg-success-soft p-5 text-center"><p className="text-lg font-extrabold text-success-ink">Bạn đã hoàn thành toàn bộ video</p><p className="mt-1 text-sm text-success-ink">Đã thành thạo {masteredIds.size}/{lesson.segments.length} đoạn ở mức che 100% không dùng gợi ý.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => goTo(0)} className="rounded-lg border border-success-line bg-surface px-4 py-2 text-sm font-bold text-success-ink">Ôn lại từ đầu</button><Link href="/listen/dictation" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-gold-ink no-underline">Về thư viện</Link></div></section>}
      {!finished && firstIncompleteIndex >= 0 && completedIds.size > 0 && <p className="mt-4 text-center text-xs text-muted">Còn {lesson.segments.length - completedIds.size} đoạn. Bạn có thể chọn bất kỳ đoạn nào trong danh sách để tiếp tục.</p>}
      <p className="mt-5 text-center text-xs text-muted">{lesson.publicAttribution}</p>
    </section>
  </main>;
}

function Feedback({ result }: { result: DictationAttemptResult }) { return <div className={`mt-5 rounded-xl border p-4 ${result.isCompleted ? "border-success-line bg-success-soft" : "border-warning-line bg-warning-soft"}`}><p className="font-extrabold text-ink">{result.isCompleted ? "Chính xác!" : `Bạn đạt ${result.scorePercent}%`}{result.isMastered && " · Đã thành thạo"}</p><p className="mt-2 whitespace-pre-wrap text-sm text-ink"><b>Đáp án:</b> {result.expectedText}</p><div className="mt-3 flex flex-wrap gap-2">{result.feedbackTokens.map((token, index) => <span key={`${token.value}-${index}`} className={`rounded-md px-2 py-1 text-xs font-bold ${token.state === "CORRECT" ? "bg-success-soft text-success-ink" : token.state === "MISSING" ? "bg-warning-soft text-warning-ink" : "bg-danger-soft text-danger-ink"}`}>{token.value}</span>)}</div><p className="mt-4 text-sm font-bold text-muted">Bạn có thể bấm <span className="rounded bg-surface px-1.5 py-0.5">Nghe tiếp</span> để chuyển và phát đoạn kế.</p></div>; }
function formatTime(seconds: number) { const minutes = Math.floor(seconds / 60); return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
