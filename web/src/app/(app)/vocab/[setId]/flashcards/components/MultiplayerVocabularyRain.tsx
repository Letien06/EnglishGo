"use client";
import { useEffect, useRef, useState } from "react";
import { rainHint } from "@/lib/vocab-arcade";
import { normalizeVocabularyAnswer } from "@/lib/vocab-content";
import { RACE_RAIN_DROP_MS, raceComboMultiplier, compareRacePlayers, type RaceRoom, type RacePlayer } from "@/lib/vocab-race";
import { useVocabRace } from "./useVocabRace";
import { MultiplayerScoreboard } from "./MultiplayerScoreboard";
import { MultiplayerCountdown } from "./MultiplayerCountdown";
import styles from "../vocabulary.module.css";
const DROP_DURATION = RACE_RAIN_DROP_MS;
export function MultiplayerVocabularyRain({ roomCode, initialRoom, initialPlayers, currentUserId, muted, onExit, onReturnToLobby }: {
  roomCode: string; initialRoom: RaceRoom; initialPlayers: RacePlayer[]; currentUserId: string;
  muted: boolean; onExit: () => void; onReturnToLobby?: () => void;
}) {
  const race = useVocabRace({ roomCode, initialRoom, initialPlayers, currentUserId, onReturnToLobby });
  const { room, players, player, words, now, isCountdown, isFinished, isPlayerFinished, submit } = race;
  const [typed, setTyped] = useState("");
  const [quiet, setQuiet] = useState(muted);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const expired = useRef(new Set<string>());
  const activeDrops = player?.activeDrops ?? [];
  const locked = isCountdown || isFinished || isPlayerFinished || !player;
  useEffect(() => { if (!isCountdown && !isFinished && !isPlayerFinished) input.current?.focus({ preventScroll: true }); }, [isCountdown, isFinished, isPlayerFinished]);
  useEffect(() => {
    if (locked) return;
    for (const drop of player?.activeDrops ?? []) {
      const key = `${drop.index}:${drop.spawnAt}`;
      if (now - drop.spawnAt < DROP_DURATION || expired.current.has(key)) continue;
      expired.current.add(key);
      submit({ type: "timeout", questionIndex: drop.index });
      if (!quiet) playSound(false);
    }
  }, [locked, now, player?.activeDrops, quiet, submit]);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 1200);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  function answer(value: string, explicit = false) {
    if (locked) return;
    const normalized = normalizeVocabularyAnswer(value);
    if (!normalized) { setTyped(value); return; }
    const visible = activeDrops.filter((drop) => drop.spawnAt <= now && now - drop.spawnAt < DROP_DURATION);
    const match = visible.find((drop) => normalizeVocabularyAnswer(words[drop.index]?.word ?? "") === normalized);
    if (match) {
      submit({ type: "answer", questionIndex: match.index, selected: value }); setTyped("");
      setFeedback({ correct: true, message: `Chính xác! Bạn đã bắt được từ "${words[match.index].word}"!` });
      if (!quiet) playSound(true);
    } else {
      setTyped(value);
      if (explicit && visible.length) {
        submit({ type: "answer", questionIndex: visible[0].index, selected: value });
        setFeedback({ correct: false, message: "Chưa khớp với từ nào đang rơi, thử lại nhé!" });
      }
    }
  }
  const syncStatus = <>{(race.pendingCount > 0 || race.syncError) && <div role="status" className="my-3 flex flex-wrap justify-center gap-3 text-sm">
    <span>{race.pendingCount > 0 && `${race.pendingCount} lượt đang đồng bộ`}{race.syncError && ` · ${race.syncError}`}</span>
    {race.syncError && <button type="button" className={styles.button} onClick={race.retrySync}>Thử đồng bộ lại</button>}
  </div>}</>;
  if (isCountdown) return <section aria-label="Đang chuẩn bị cuộc đua">
    <MultiplayerCountdown countdownEndsAt={room.countdownEndsAt ?? 0} now={now} clockPending={!race.isClockReady} gameMode="rain" roomCode={roomCode} players={players} currentUserId={currentUserId} muted={quiet} />
    {race.clockError && <div role="alert" className="my-3 text-center"><p>{race.clockError}</p><button type="button" className={styles.button} onClick={race.retrySync}>Thử đồng bộ lại</button></div>}
    <div className="text-center"><button type="button" className={styles.button} onClick={onExit}>Rời phòng</button></div>
  </section>;
  if (isFinished) {
    const sorted = [...players].sort(compareRacePlayers);
    const best = sorted[0];
    const winners = best ? sorted.filter((entry) => entry.score === best.score && (entry.correctCount ?? 0) === (best.correctCount ?? 0)) : [];
    return <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center">
      <div className="mb-3 text-6xl" aria-hidden="true">🌧️</div><h2 className="text-3xl font-black">TỔNG KẾT MƯA TỪ VỰNG</h2>
      {best && <div className="my-6 rounded-2xl border border-amber-400/50 bg-amber-400/10 p-6"><p className="font-bold text-amber-400">{winners.length > 1 ? "Đồng quán quân" : "Quán quân gõ nhanh"}</p><strong className="text-2xl">{winners.map((entry) => entry.displayName).join(" · ")}</strong><p>{best.score} điểm</p></div>}
      <MultiplayerScoreboard players={sorted} currentUserId={currentUserId} />{syncStatus}
      {race.resetError && <p role="alert" className="my-3 text-danger">{race.resetError}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {room.hostId === currentUserId ? <button type="button" disabled={race.resetting || race.pendingCount > 0} className={`${styles.button} ${styles.primary}`} onClick={race.returnToLobby}>{race.resetting ? "Đang trở lại phòng..." : "Quay lại phòng chơi tiếp"}</button> : <p>Đang chờ chủ phòng bắt đầu lượt mới.</p>}
        <button type="button" className={styles.button} onClick={onExit}>Rời phòng</button>
      </div>
    </section>;
  }
  const prefix = normalizeVocabularyAnswer(typed);
  return <section className={`${styles.arcadeRound} relative min-h-[640px]`} aria-label="Mưa từ vựng Đối Kháng">
    <MultiplayerScoreboard players={players} currentUserId={currentUserId} />
    <header className={styles.toolbar}><div><span className={styles.eyebrow}>ĐỐI KHÁNG TRỰC TIẾP · PHÒNG #{roomCode}</span><h2 className="text-xl font-bold">Mưa Từ Vựng — Đua Tốc Độ</h2></div><div className="flex gap-2"><button type="button" className={styles.button} onClick={() => setQuiet(!quiet)}>{quiet ? "Bật âm thanh" : "Tắt âm thanh"}</button><button type="button" className={styles.button} onClick={onExit}>Rời phòng</button></div></header>
    {syncStatus}
    {isPlayerFinished ? <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
      <h3 className="text-xl font-black">{(player?.lives ?? 0) <= 0 ? "BẠN ĐÃ HẾT TIM & BỊ LOẠI!" : "Bạn đã hoàn thành lượt chơi!"}</h3>
      <p className="mt-3">{player?.score ?? 0} điểm · {player?.correctCount ?? 0} từ đúng</p><p className="mt-3">Đang chờ các đối thủ hoàn thành. Điểm vẫn cập nhật trực tiếp.</p>
    </div> : <>
      <div className={styles.rainArena}><div className={styles.scoreboard}>
        <span className={styles.hearts} aria-label={`Còn ${player?.lives ?? 0} mạng`}>{"❤️".repeat(Math.max(0, Math.min(3, player?.lives ?? 0)))}<span>{"🤍".repeat(Math.max(0, 3 - Math.max(0, player?.lives ?? 0)))}</span></span>
        <span>Số từ còn lại: {Math.max(0, words.length - (player?.nextIndex ?? 0) + activeDrops.length)}</span><span>Combo x{raceComboMultiplier(player?.combo ?? 0)}</span><strong>{player?.score ?? 0} điểm</strong>
        {room.matchEndsAt && <span>Còn {Math.max(0, Math.ceil((room.matchEndsAt - now) / 1000))}s</span>}
      </div><div className={styles.rainField}>
        {activeDrops.map((drop) => {
          if (now < drop.spawnAt) return null;
          const word = words[drop.index]; if (!word) return null;
          const fraction = Math.min(1, Math.max(0, (now - drop.spawnAt) / DROP_DURATION));
          const matching = Boolean(prefix && normalizeVocabularyAnswer(word.word).startsWith(prefix));
          const hint = matching ? [...word.word].map((letter, index) => index < typed.trim().length ? letter : "_").join("") : rainHint(word.word, fraction);
          return <div key={`${drop.index}:${drop.spawnAt}`} className={styles.rainTrack} data-lane={drop.lane} style={{ transform: `translateY(${fraction * 100}%)` }}><div className={styles.rainClue} data-testid="rain-drop" data-matching={matching}><strong>{word.meaning}</strong><span aria-label="Gợi ý chữ">{hint}</span><small>{Math.max(0, Math.ceil((1 - fraction) * DROP_DURATION / 1000))}s</small></div></div>;
        })}<div className={styles.ground} />
      </div></div>
      <form className={styles.rainInput} onSubmit={(event) => { event.preventDefault(); answer(typed, true); }}>
        <input ref={input} className={styles.input} aria-label="Từ tiếng Anh" placeholder="Gõ từ tiếng Anh tương ứng với nghĩa đang rơi..." value={typed} disabled={locked} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => { if ((event.nativeEvent as InputEvent).isComposing) setTyped(event.target.value); else answer(event.target.value); }} onKeyDown={(event) => { if (event.key === "Escape") setTyped(""); }} />
        <button type="submit" disabled={!typed.trim() || locked} className={`${styles.button} ${styles.primary}`}>Bắt từ</button>
      </form>
      {feedback && <p role="status" className={feedback.correct ? styles.success : styles.error}>{feedback.message}</p>}
      <footer className="text-center text-xs text-[var(--muted)]">Mỗi người có lượt riêng · 10 điểm × combo, tối đa ×4 · Tối đa 2 từ rơi cùng lúc · Esc xóa chữ đang gõ</footer>
    </>}
  </section>;
}
function playSound(correct: boolean) {
  try {
    const context = new window.AudioContext(), oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination); oscillator.type = correct ? "sine" : "square";
    oscillator.frequency.setValueAtTime(correct ? 523 : 300, context.currentTime);
    oscillator.frequency.linearRampToValueAtTime(correct ? 784 : 100, context.currentTime + 0.3);
    gain.gain.setValueAtTime(0.12, context.currentTime); gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.35);
    oscillator.start(); oscillator.stop(context.currentTime + 0.35); oscillator.onended = () => { void context.close(); };
  } catch { /* Audio is optional. */ }
}
