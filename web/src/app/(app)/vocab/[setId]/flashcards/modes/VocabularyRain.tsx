"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { createRainState, rainFraction, rainReducer } from "@/lib/vocab-rain";
import { arcadeDuration, rainHint, type ArcadeState, type VocabularyRoundResult } from "@/lib/vocab-arcade";
import { normalizeVocabularyAnswer } from "@/lib/vocab-content";
import useVocabularyAudio from "../useVocabularyAudio";
import styles from "../vocabulary.module.css";

/* ---- Sound effects via Web Audio API ---- */
function playFailSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(300, ctx.currentTime);
    oscillator.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => ctx.close();
  } catch { /* audio not available */ }
}

function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(523, ctx.currentTime);
    oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => ctx.close();
  } catch { /* audio not available */ }
}

export default function VocabularyRain({ initialState, muted, suspended, onComplete, onExit, onRestart }: {
  initialState: ArcadeState; muted: boolean; suspended: boolean;
  onComplete: (result: VocabularyRoundResult) => void; onExit: () => void;
  onRestart?: () => void;
}) {
  const [state, dispatch] = useReducer(rainReducer, initialState, (initial) => createRainState(initial.words, initial.untimed));
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const completed = useRef(false);
  const { speakWord, stop } = useVocabularyAudio();
  const paused = state.paused || suspended;

  // Track answer count for sound effects
  const prevAnswerCount = useRef(state.answers.length);
  useEffect(() => {
    if (state.answers.length > prevAnswerCount.current) {
      const latest = state.answers[state.answers.length - 1];
      if (!muted) {
        if (latest.correct) {
          playSuccessSound();
          // Small delay before pronunciation so SFX plays first
          const timer = window.setTimeout(() => speakWord(latest.item), 200);
          prevAnswerCount.current = state.answers.length;
          return () => window.clearTimeout(timer);
        } else {
          playFailSound();
          // Pronounce the missed word after fail sound
          const timer = window.setTimeout(() => speakWord(latest.item), 400);
          prevAnswerCount.current = state.answers.length;
          return () => window.clearTimeout(timer);
        }
      }
    }
    prevAnswerCount.current = state.answers.length;
  }, [state.answers, muted, speakWord]);

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

  // ---- Game Over screen (like dauenglish) ----
  if (state.done) {
    const correctCount = state.answers.filter((a) => a.correct).length;
    const total = state.answers.length;
    const droppedWords = state.answers.filter((a) => !a.correct);
    const accuracy = total ? Math.round((correctCount / total) * 100) : 0;
    return <section className={styles.arcadeRound} aria-label="Kết quả mưa từ vựng">
      <div className={styles.rainArena}>
        <div className={styles.rainGameOver}>
          <div className={styles.rainGameOverIcon} aria-hidden="true">🌧️</div>
          <h2 className={styles.rainGameOverTitle}>{state.lives ? "Bắt từ rất tốt!" : "Hết mạng rồi!"}</h2>
          <p className={styles.rainGameOverSubtitle}>Mưa từ vựng · {total}/{state.words.length} từ</p>

          <div className={styles.rainGameOverStats}>
            <div className={styles.rainGameOverStat}>
              <strong>{state.score}</strong>
              <small>Điểm</small>
            </div>
            <div className={styles.rainGameOverStat}>
              <strong>Từ đúng ({accuracy}%)</strong>
              <small>{correctCount} từ</small>
            </div>
            <div className={styles.rainGameOverStat}>
              <strong>Combo cao nhất</strong>
              <small>x{Math.max(1, state.maxCombo)}</small>
            </div>
          </div>

          {droppedWords.length > 0 && <>
            <h3 className={styles.rainGameOverReviewTitle}>Từ để lọt ({droppedWords.length})</h3>
            <div className={styles.rainGameOverWordList}>
              {droppedWords.map((a, i) => (
                <div key={`${a.item.id}-${i}`} className={styles.rainGameOverWordRow}>
                  <button type="button" className={styles.rainSpeakBtn} onClick={() => speakWord(a.item)} aria-label={`Nghe ${a.item.word}`}>🔊</button>
                  <strong>{a.item.word}</strong>
                  <span>{a.item.meaning}</span>
                </div>
              ))}
            </div>
          </>}

          <div className={styles.rainGameOverActions}>
            <button className={`${styles.button} ${styles.primary}`} onClick={() => { if (onRestart) onRestart(); else window.location.reload(); }}>↻ Chơi lại</button>
            <button className={styles.button} disabled={suspended} onClick={() => { if (!completed.current) { completed.current = true; stop(); onComplete({ answers: state.answers, score: state.score }); } }}>Xem kết quả</button>
            <button className={styles.button} onClick={onExit}>≡ Về danh sách trò chơi</button>
          </div>
        </div>
      </div>
    </section>;
  }

  return <section className={styles.arcadeRound} aria-label="Mưa từ vựng">
    <header className={styles.toolbar}><div><span className={styles.eyebrow}>GÕ NHANH · NHỚ LÂU</span><h2 className="text-xl font-bold text-ink">Mưa từ vựng</h2></div><div className="flex gap-2"><button className={styles.button} disabled={state.done || suspended} onClick={() => dispatch({ type: "pause", paused: !state.paused })}>{state.paused ? "Tiếp tục chơi" : "Tạm dừng"}</button><button className={styles.button} onClick={onExit}>Thoát</button></div></header>
    <div className={styles.rainArena}>
      <div className={styles.scoreboard}><span className={styles.hearts} aria-label={`Còn ${state.lives} mạng`}>{"♥".repeat(state.lives)}<span>{"♡".repeat(3 - state.lives)}</span></span><span>Mốc {Math.min(10, Math.floor(state.answers.length / 2) + 1)}/{Math.min(10, Math.ceil(state.words.length / 2))}</span><strong>{state.score} điểm · x{Math.min(4, 1 + Math.floor(state.combo / 3))}</strong></div>
      <div className={styles.rainField} data-paused={paused}>
        {state.drops.map((drop) => {
          const word = state.words[drop.index];
          const fraction = rainFraction(state, drop);
          const prefix = normalizeVocabularyAnswer(typed);
          const matches = !!prefix && normalizeVocabularyAnswer(word.word).startsWith(prefix);
          const hint = matches ? [...word.word].map((letter, index) => index < typed.trim().length ? letter : "_").join("") : rainHint(word.word, fraction);
          return <div key={word.id} className={styles.rainTrack} data-lane={drop.lane} style={{ transform: `translateY(${fraction * 100}%)` }}><div className={styles.rainClue} data-testid="rain-drop" data-matching={matches}><strong>{word.meaning}</strong><span aria-label="Gợi ý chữ">{hint}</span><small>{state.untimed ? "Không giới hạn" : `${Math.ceil((1 - fraction) * arcadeDuration(drop.index) / 1000)}s`}</small></div></div>;
        })}
        <div className={styles.ground} />
        {paused && <div className={styles.pause}><h3 className="text-2xl font-bold">Đã tạm dừng</h3><p>Thời gian và mạng được giữ nguyên.</p><button className={`${styles.button} ${styles.primary}`} disabled={suspended} onClick={() => dispatch({ type: "pause", paused: false })}>Tiếp tục chơi</button></div>}
      </div>
      {/* Answer bar — shows the most recently dropped or correctly answered word */}
      {state.droppedWord && <div className={styles.rainAnswerBar} data-correct={false}>
        <button type="button" className={styles.rainSpeakBtn} onClick={() => speakWord(state.droppedWord!)} aria-label={`Nghe ${state.droppedWord.word}`}>🔊</button>
        <span>Đáp án: <strong>{state.droppedWord.word}</strong></span>
        <span className={styles.rainAnswerMeaning}>{state.droppedWord.meaning}</span>
      </div>}
    </div>
    <form className={styles.rainInput} onSubmit={(event) => { event.preventDefault(); submit(typed); }}>
      <input ref={input} className={styles.input} aria-label="Từ tiếng Anh" placeholder="Gõ từ tiếng Anh của nghĩa đang rơi..." value={typed} disabled={paused || state.done} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => { if ((event.nativeEvent as InputEvent).isComposing) setTyped(event.target.value); else submit(event.target.value, true); }} onKeyDown={(event) => { if (event.key === "Escape") setTyped(""); }} />
      <button className={`${styles.button} ${styles.primary}`} disabled={!typed.trim() || paused || state.done}>Gửi</button>
    </form>
    <p className={styles.arcadeHelp}>Nhấn Enter để bắt đầu · Esc xoá chữ đang gõ · {state.untimed ? "Không giới hạn thời gian" : "Tối đa 2 từ rơi cùng lúc"}</p>
    {state.notice && <div className={state.lastCorrect ? styles.success : styles.error} role="status"><p>{state.notice}</p></div>}
  </section>;
}
