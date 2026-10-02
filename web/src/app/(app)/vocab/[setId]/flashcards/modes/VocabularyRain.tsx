"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { createRainState, rainFraction, rainReducer } from "@/lib/vocab-rain";
import { arcadeDuration, rainHint, type ArcadeState, type VocabularyRoundResult } from "@/lib/vocab-arcade";
import { normalizeVocabularyAnswer } from "@/lib/vocab-content";
import useVocabularyAudio from "../useVocabularyAudio";
import styles from "../vocabulary.module.css";

export default function VocabularyRain({ initialState, muted, suspended, onComplete, onExit }: {
  initialState: ArcadeState; muted: boolean; suspended: boolean;
  onComplete: (result: VocabularyRoundResult) => void; onExit: () => void;
}) {
  const [state, dispatch] = useReducer(rainReducer, initialState, (initial) => createRainState(initial.words, initial.untimed));
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const completed = useRef(false);
  const { speakWord, stop } = useVocabularyAudio();
  const paused = state.paused || suspended;
  const latest = state.answers.at(-1);
  useEffect(() => {
    if (latest && !muted) speakWord(latest.item);
  }, [latest, muted, speakWord]);
  useEffect(() => {
    function hide() { if (document.hidden) { dispatch({ type: "pause", paused: true }); stop(); } }
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [stop]);
  useEffect(() => {
    if (paused || state.done || state.untimed) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (document.hidden) { dispatch({ type: "pause", paused: true }); return; }
      dispatch({ type: "tick", delta: now - previous });
      previous = now;
    }, 100);
    return () => window.clearInterval(timer);
  }, [paused, state.done, state.untimed]);
  useEffect(() => { if (!paused && !state.done) input.current?.focus({ preventScroll: true }); }, [paused, state.done]);

  function submit(value: string, automatic = false) {
    if (paused || state.done) return;
    const matched = state.drops.some((drop) => normalizeVocabularyAnswer(state.words[drop.index].word) === normalizeVocabularyAnswer(value));
    if (!automatic || matched) dispatch({ type: "answer", value });
    setTyped(matched ? "" : value);
  }

  return <section className={styles.arcadeRound} aria-label="Mưa từ vựng">
    <header className={styles.toolbar}><div><span className={styles.eyebrow}>GÕ NHANH · NHỚ LÂU</span><h2 className="text-xl font-bold text-ink">Mưa từ vựng</h2></div><div className="flex gap-2"><button className={styles.button} disabled={state.done || suspended} onClick={() => dispatch({ type: "pause", paused: !state.paused })}>{state.paused ? "Tiếp tục chơi" : "Tạm dừng"}</button><button className={styles.button} onClick={onExit}>Thoát</button></div></header>
    <div className={styles.rainArena}>
      <div className={styles.scoreboard}><span className={styles.hearts} aria-label={`Còn ${state.lives} mạng`}>{"♥".repeat(state.lives)}<span>{"♡".repeat(3 - state.lives)}</span></span><span>{state.answers.length}/{state.words.length} từ · Mốc {Math.min(10, Math.floor(state.answers.length / 2) + 1)}</span><strong>{state.score} điểm · x{Math.min(4, 1 + Math.floor(state.combo / 3))}</strong></div>
      <div className={styles.rainField} data-paused={paused}>
        {!state.done && state.drops.map((drop) => {
          const word = state.words[drop.index];
          const fraction = rainFraction(state, drop);
          const prefix = normalizeVocabularyAnswer(typed);
          const matches = !!prefix && normalizeVocabularyAnswer(word.word).startsWith(prefix);
          const hint = matches ? [...word.word].map((letter, index) => index < typed.trim().length ? letter : "_").join("") : rainHint(word.word, fraction);
          return <div key={word.id} className={styles.rainTrack} data-lane={drop.lane} style={{ transform: `translateY(${fraction * 100}%)` }}><div className={styles.rainClue} data-testid="rain-drop" data-matching={matches}><strong>{word.meaning}</strong><span aria-label="Gợi ý chữ">{hint}</span><small>{state.untimed ? "Không giới hạn" : `${Math.ceil((1 - fraction) * arcadeDuration(drop.index) / 1000)}s`}</small></div></div>;
        })}
        <div className={styles.ground} />
        {paused && <div className={styles.pause}><h3 className="text-2xl font-bold">Đã tạm dừng</h3><p>Thời gian và mạng được giữ nguyên.</p><button className={`${styles.button} ${styles.primary}`} disabled={suspended} onClick={() => dispatch({ type: "pause", paused: false })}>Tiếp tục chơi</button></div>}
        {state.done && <div className={styles.pause}><span className={styles.eyebrow}>HOÀN THÀNH LƯỢT CHƠI</span><h3 className="text-2xl font-bold">{state.lives ? "Bắt từ rất tốt!" : "Hết mạng rồi. Thử lại nhé!"}</h3><p>{state.score} điểm · {state.answers.filter((answer) => answer.correct).length} từ đúng</p><button className={`${styles.button} ${styles.primary}`} disabled={suspended} onClick={() => { if (!completed.current) { completed.current = true; stop(); onComplete({ answers: state.answers, score: state.score }); } }}>Xem kết quả</button></div>}
      </div>
    </div>
    <form className={styles.rainInput} onSubmit={(event) => { event.preventDefault(); submit(typed); }}>
      <input ref={input} className={styles.input} aria-label="Từ tiếng Anh" placeholder="Gõ từ tiếng Anh của nghĩa đang rơi..." value={typed} disabled={paused || state.done} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => { if ((event.nativeEvent as InputEvent).isComposing) setTyped(event.target.value); else submit(event.target.value, true); }} onKeyDown={(event) => { if (event.key === "Escape") setTyped(""); }} />
      <button className={`${styles.button} ${styles.primary}`} disabled={!typed.trim() || paused || state.done}>Gửi</button>
    </form>
    <p className={styles.arcadeHelp}>Tự bắt khi gõ đúng · Enter để kiểm tra · Esc để xóa · {state.untimed ? "Không giới hạn thời gian" : "Tối đa 2 từ rơi cùng lúc"}</p>
    <div className={state.lastCorrect ? styles.success : styles.details} role="status">{state.notice || "Nhìn nghĩa, gõ từ tiếng Anh. Bạn làm được!"}</div>
  </section>;
}
