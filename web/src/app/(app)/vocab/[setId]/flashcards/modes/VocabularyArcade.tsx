"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import { arcadeDuration, arcadeReducer, arcadeWords, createArcadeState, rainHint, type ArcadeState, type VocabularyArcadeMode, type VocabularyRoundResult } from "@/lib/vocab-arcade";
import useVocabularyAudio from "../useVocabularyAudio";
import styles from "../vocabulary.module.css";

export default function VocabularyArcade({ words, mode, muted, suspended = false, onComplete, onExit }: {
  words: VocabWordCard[];
  mode: VocabularyArcadeMode;
  muted: boolean;
  suspended?: boolean;
  onComplete: (result: VocabularyRoundResult) => void;
  onExit: () => void;
}) {
  const [initialState, setInitialState] = useState<ArcadeState | null>(null);
  const [untimed, setUntimed] = useState(false);
  const title = mode === "blast" ? "Word Blast" : "Mưa từ vựng";
  if (initialState) return <ArcadeRound initialState={initialState} muted={muted} suspended={suspended} onComplete={onComplete} onExit={onExit} />;
  const count = Math.min(20, arcadeWords(words).length);
  return <section className={`${styles.hero} space-y-5`}>
    <span className={styles.eyebrow}>Góc luyện phản xạ · chơi một mình</span>
    <h2>{title}</h2>
    <p>{mode === "blast" ? "Nhìn nghĩa tiếng Việt, chọn từ tiếng Anh trước khi chạm vạch. Mỗi đáp án đúng nhận 10 điểm." : "Nghĩa tiếng Việt đang rơi! Gõ từ tiếng Anh và nhấn Enter để bắt lấy. Đúng liên tiếp để tăng combo."}</p>
    <ul className="space-y-2 text-sm text-ink2">
      <li>{count} từ mỗi lượt · 3 mạng · tốc độ tăng sau mỗi 2 từ.</li>
      <li>{mode === "blast" ? "Chọn sai hoặc để từ chạm vạch: mất 1 mạng." : "Gõ chưa đúng có thể thử lại. Để từ chạm vạch: mất 1 mạng; đáp án hiện để bạn ôn lại."}</li>
      {mode === "rain" && <li>Gợi ý xuất hiện ở 40% và 70% thời gian: 15 → 10 → 5 điểm. Mỗi 3 câu đúng liên tiếp tăng hệ số, tối đa x4.</li>}
      <li>Tự tạm dừng khi chuyển tab. Từ sai được giữ trong nhóm cần ôn khi lưu cuối lượt.</li>
    </ul>
    <label className="flex items-center gap-3 text-sm text-ink"><input type="checkbox" checked={untimed} onChange={(event) => setUntimed(event.target.checked)} className="h-5 w-5" />Không giới hạn thời gian (luyện nhẹ nhàng)</label>
    <div className="flex flex-wrap gap-3"><button className={`${styles.button} ${styles.primary}`} disabled={!count} onClick={() => setInitialState(createArcadeState(mode, words, untimed))}>Bắt đầu chơi</button><button className={styles.button} onClick={onExit}>Quay lại</button></div>
    {!count && <p role="status">Bộ hiện tại chưa có từ và nghĩa để chơi.</p>}
  </section>;
}

function ArcadeRound({ initialState, muted, suspended, onComplete, onExit }: {
  initialState: ArcadeState;
  muted: boolean;
  suspended: boolean;
  onComplete: (result: VocabularyRoundResult) => void;
  onExit: () => void;
}) {
  const [state, dispatch] = useReducer(arcadeReducer, initialState);
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const falling = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(140);
  const finished = useRef(false);
  const { speakWord, stop } = useVocabularyAudio();
  const word = state.words[state.index];
  const duration = arcadeDuration(state.index);
  const fraction = Math.min(1, state.elapsed / duration);
  const done = state.lives <= 0 || state.index + 1 >= state.words.length;

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (field.current && falling.current) setTravel(Math.max(0, field.current.clientHeight - falling.current.offsetHeight - 12));
    });
    if (field.current) observer.observe(field.current);
    if (falling.current) observer.observe(falling.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function hide() { if (document.hidden) { dispatch({ type: "pause", paused: true }); stop(); } }
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", hide);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("blur", hide); };
  }, [stop]);

  useEffect(() => {
    if (suspended || state.paused || state.phase !== "playing" || state.untimed) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (document.hidden) { dispatch({ type: "pause", paused: true }); return; }
      dispatch({ type: "tick", delta: now - previous });
      previous = now;
    }, 100);
    return () => window.clearInterval(timer);
  }, [state.paused, state.phase, state.untimed, state.index, suspended]);

  useEffect(() => {
    if (suspended || state.paused || state.phase !== "playing" || state.mode !== "blast") return;
    function answerWithKey(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !/^[1-4]$/.test(event.key)) return;
      const option = state.options[state.index][Number(event.key) - 1];
      if (option) { event.preventDefault(); dispatch({ type: "answer", value: option.word, optionId: option.id }); }
    }
    window.addEventListener("keydown", answerWithKey);
    return () => window.removeEventListener("keydown", answerWithKey);
  }, [state.mode, state.paused, state.phase, state.options, state.index, suspended]);

  useEffect(() => {
    if (state.phase === "feedback") continueButton.current?.focus({ preventScroll: true });
    if (state.phase === "feedback" && !muted) speakWord(word);
  }, [state.phase, word, muted, speakWord]);

  useEffect(() => {
    if (!state.paused && state.phase === "playing" && state.mode === "rain") input.current?.focus({ preventScroll: true });
  }, [state.paused, state.phase, state.mode, state.index]);

  function next() {
    stop();
    if (done) {
      if (finished.current) return;
      finished.current = true;
      onComplete({ answers: state.answers, score: state.score });
    } else { setTyped(""); dispatch({ type: "next" }); }
  }

  return <section className="mx-auto max-w-3xl space-y-4" aria-label={state.mode === "blast" ? "Word Blast" : "Mưa từ vựng"}>
    <div className={styles.toolbar}><h2 className="text-xl font-bold text-ink">{state.mode === "blast" ? "Word Blast" : "Mưa từ vựng"}</h2><div className="flex gap-2"><button className={styles.button} onClick={() => dispatch({ type: "pause", paused: !state.paused })}>{state.paused ? "Tiếp tục chơi" : "Tạm dừng"}</button><button className={styles.button} onClick={onExit}>Thoát</button></div></div>
    <div className={styles.arcade}>
      <div className={styles.scoreboard}><span aria-label={`Còn ${state.lives} mạng`}>♥ {state.lives}/3</span><span>Mốc {Math.floor(state.index / 2) + 1} · {state.index + 1}/{state.words.length}</span><span>{state.score} điểm{state.mode === "rain" && ` · Combo ${state.combo}`}</span></div>
      <div className="p-4 text-center"><p className="text-xs uppercase tracking-widest text-muted">{state.mode === "blast" ? "Chọn từ tiếng Anh" : "Gõ tiếng Anh rồi nhấn Enter"}</p>{state.mode === "blast" && <h3 className="mt-2 text-2xl font-bold text-ink">{word.meaning}</h3>}<p className="mt-1 text-xs text-muted">{state.untimed ? "Không giới hạn thời gian" : `Còn ${Math.ceil((duration - state.elapsed) / 1000)} giây`}</p></div>
      <div ref={field} className={styles.field}>
        {state.mode === "blast" ? <div ref={falling} className={styles.targets} style={{ transform: `translateY(${12 + fraction * travel}px)` }}>
          {state.options[state.index].map((option, index) => <button key={option.id} className={styles.target} disabled={state.paused || state.phase === "feedback" || state.disabled.includes(option.id)} onClick={() => dispatch({ type: "answer", value: option.word, optionId: option.id })}><small className="mr-2 text-xs text-muted">{index + 1}</small>{option.word}</button>)}
        </div> : <div ref={falling} className={styles.drop} style={{ transform: `translateY(${12 + fraction * travel}px)` }}><strong>{word.meaning}</strong><span aria-label="Gợi ý chữ">{rainHint(word.word, fraction)}</span></div>}
        <div className={styles.ground} />
        {state.paused && <div className={styles.pause}><h3 className="text-2xl font-bold">Đã tạm dừng</h3><p className="text-sm text-muted">Thời gian và mạng được giữ nguyên.</p><button className={`${styles.button} ${styles.primary}`} onClick={() => dispatch({ type: "pause", paused: false })}>Tiếp tục chơi</button></div>}
      </div>
      <div className={styles.progress}><span style={{ transform: `scaleX(${1 - fraction})` }} /></div>
    </div>
    {state.mode === "rain" && <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); dispatch({ type: "answer", value: typed }); }}>
      <input ref={input} className={styles.input} aria-label="Từ tiếng Anh" placeholder="Gõ từ tiếng Anh..." value={typed} disabled={state.paused || state.phase === "feedback"} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => setTyped(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setTyped(""); }} />
      <button className={`${styles.button} ${styles.primary}`} disabled={!typed.trim() || state.paused || state.phase === "feedback"}>Gửi</button>
    </form>}
    {state.notice && <div className={state.lastCorrect ? styles.success : styles.error} role="status"><p>{state.notice}</p>{state.phase === "feedback" && <p className="mt-1 text-sm">{word.word} — {word.meaning}</p>}</div>}
    {state.phase === "feedback" && <div className="flex flex-wrap gap-2"><button ref={continueButton} className={`${styles.button} ${styles.primary}`} disabled={state.paused} onClick={next}>{done ? "Xem kết quả" : "Từ tiếp theo →"}</button><button className={styles.button} onClick={() => speakWord(word)}>Nghe lại</button></div>}
  </section>;
}
