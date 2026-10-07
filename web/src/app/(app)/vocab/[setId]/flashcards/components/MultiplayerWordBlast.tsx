"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import type { RacePlayer, RaceRoom } from "@/lib/vocab-race";
import { compareRacePlayers, raceComboMultiplier } from "@/lib/vocab-race";
import { blastOptions, createFloatingTargets, tickFloatingTarget, type FloatingTarget } from "@/lib/vocab-arcade";
import { normalizeVocabularyAnswer } from "@/lib/vocab-content";
import { wordBlastQuestionMs } from "@/lib/word-blast-timing";
import { MultiplayerScoreboard } from "./MultiplayerScoreboard";
import { MultiplayerCountdown } from "./MultiplayerCountdown";
import { useVocabRace } from "./useVocabRace";
import styles from "../vocabulary.module.css";

interface MultiplayerWordBlastProps {
  roomCode: string;
  initialRoom: RaceRoom;
  initialPlayers: RacePlayer[];
  currentUserId: string;
  muted: boolean;
  onExit: () => void;
  onReturnToLobby?: () => void;
}

function pseudoRandom(seed: number) {
  let value = seed % 2147483647 || 1;
  return () => { value = value * 16807 % 2147483647; return (value - 1) / 2147483646; };
}

function playShot(correct: boolean) {
  try {
    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.type = correct ? "sine" : "square";
    oscillator.frequency.setValueAtTime(correct ? 659 : 220, context.currentTime);
    gain.gain.setValueAtTime(0.1, context.currentTime);
    gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.15);
    oscillator.start(); oscillator.stop(context.currentTime + 0.15);
    oscillator.onended = () => { void context.close(); };
  } catch { /* Audio support is optional. */ }
}

function BlastField({ options, correctId, disabledAnswers, blocked, onSelect }: {
  options: VocabWordCard[]; correctId: number | undefined; disabledAnswers: string[]; blocked: boolean;
  onSelect: (option: VocabWordCard) => void;
}) {
  const [floats, setFloats] = useState<FloatingTarget[]>(() => createFloatingTargets(options.length));
  const [hovered, setHovered] = useState<number | null>(null);
  const [shot, setShot] = useState<number | null>(null);
  const [aim, setAim] = useState(0);
  const field = useRef<HTMLDivElement>(null);
  const shotLock = useRef(new Set<number>());
  const questionLocked = useRef(false);
  const disabled = useCallback((option: VocabWordCard) => blocked || disabledAnswers.includes(normalizeVocabularyAnswer(option.word)), [blocked, disabledAnswers]);
  const select = useCallback((option: VocabWordCard) => {
    if (disabled(option) || questionLocked.current || shotLock.current.has(option.id)) return;
    shotLock.current.add(option.id);
    if (option.id === correctId) questionLocked.current = true;
    setShot(option.id);
    onSelect(option);
  }, [disabled, onSelect, correctId]);
  const aimAt = (index: number) => {
    const target = floats[index];
    const width = field.current?.clientWidth || 800;
    const height = field.current?.clientHeight || 350;
    if (target) setAim(Math.atan2((target.x / 100 - 0.5) * width, height - 25 - target.y / 100 * height) * 180 / Math.PI);
  };

  useEffect(() => {
    if (blocked) return;
    let raf = 0;
    let last = performance.now();
    let accumulated = 0;
    const animate = (now: number) => {
      accumulated += Math.min(now - last, 200); last = now;
      if (accumulated >= 33) {
        const delta = accumulated; accumulated = 0;
        setFloats((previous) => previous.map((target) => tickFloatingTarget(target, delta)));
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [blocked]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < options.length && /^[1-4]$/.test(event.key)) {
        event.preventDefault(); select(options[index]);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [options, select]);

  const aimIndex = options.findIndex((option) => option.id === (hovered ?? shot));
  const target = floats[aimIndex];
  return <div ref={field} className={styles.field} data-paused={blocked}>
    {options.map((option, index) => {
      const position = floats[index] ?? { x: 15 + index * 20, y: 35 };
      const wrong = disabledAnswers.includes(normalizeVocabularyAnswer(option.word));
      return <button key={option.id} type="button" className={`${styles.floatingTarget} ${wrong ? styles.floatingTargetWrong : ""}`} data-nth={index + 1} data-targeted={hovered === option.id ? "true" : undefined} data-hit={shot === option.id ? wrong ? "wrong" : "correct" : undefined} style={{ left: `${position.x}%`, top: `${position.y}%` }} disabled={disabled(option)} onClick={() => { aimAt(index); select(option); }} onPointerEnter={() => { setHovered(option.id); aimAt(index); }} onPointerLeave={() => setHovered(null)}><kbd>{index + 1}</kbd> {option.word}{shot === option.id && <span className={styles.hitBurst} aria-hidden="true">{wrong ? "×" : "✦"}</span>}</button>;
    })}
    {target && <svg className={styles.aimGuideOverlay} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><line x1="500" y1="870" x2={target.x * 10} y2={target.y * 10} className={styles.aimLaserGuide} /></svg>}
    <div className={styles.ground} />
    <div className={styles.cannon} data-aiming={hovered !== null ? "true" : undefined} aria-hidden="true"><svg viewBox="0 0 100 100"><g style={{ transform: `rotate(${aim}deg)`, transformOrigin: "50px 75px" }}><path d="M40 70V20Q50 10 60 20V70Z" /><path d="M43 25H57M43 35H57" /><ellipse cx="50" cy="20" rx="10" ry="4" className={styles.cannonMuzzle} /></g><path d="M25 85Q25 60 50 60Q75 60 75 85Z" /><ellipse cx="50" cy="85" rx="36" ry="8" /></svg></div>
    {shot !== null && <div key={shot} className={styles.shotBeam} style={{ rotate: `${aim}deg` }} aria-hidden="true" />}
  </div>;
}

export function MultiplayerWordBlast({ roomCode, initialRoom, initialPlayers, currentUserId, muted, onExit, onReturnToLobby }: MultiplayerWordBlastProps) {
  const race = useVocabRace({ roomCode, initialRoom, initialPlayers, currentUserId, onReturnToLobby });
  const { room, players, player, words, now, isCountdown, isFinished, isPlayerFinished, pendingCount, syncError, submit, retrySync, resetting, resetError, returnToLobby } = race;
  const [quiet, setQuiet] = useState(muted);
  const [feedback, setFeedback] = useState<{ message: string; index: number } | null>(null);
  const timeoutSent = useRef<string | null>(null);
  const finishSent = useRef(false);
  const index = player?.currentIndex ?? 0;
  const currentWord = words[index];
  const duration = wordBlastQuestionMs(room.questionDurationMs);
  const startsAt = player?.questionStartedAt ?? now;
  const remaining = Math.max(0, Math.ceil((duration - Math.max(0, now - startsAt)) / 1000));
  const matchRemaining = Math.max(0, Math.ceil(((room.matchEndsAt ?? now + 120000) - now) / 1000));
  const paused = !player || isCountdown || isFinished || isPlayerFinished || now < startsAt || matchRemaining === 0;
  const options = useMemo(() => currentWord ? blastOptions(currentWord, words, pseudoRandom([...roomCode].reduce((total, letter) => total + letter.charCodeAt(0), 0) + index * 997)) : [], [currentWord, words, roomCode, index]);

  useEffect(() => {
    if (!player || isCountdown || isFinished || isPlayerFinished) return;
    if (matchRemaining === 0) {
      if (!finishSent.current) { finishSent.current = true; submit({ type: "finish", questionIndex: index }); }
      return;
    }
    const key = `${index}:${startsAt}`;
    if (now >= startsAt + duration && timeoutSent.current !== key) {
      timeoutSent.current = key;
      submit({ type: "timeout", questionIndex: index });
    }
  }, [player, isCountdown, isFinished, isPlayerFinished, matchRemaining, index, startsAt, duration, now, submit]);

  const select = useCallback((option: VocabWordCard) => {
    if (paused || !currentWord) return;
    const correct = option.id === currentWord.id;
    if (!quiet) playShot(correct);
    setFeedback({ message: correct ? "Chính xác! Tiếp tục tăng combo." : "Sai rồi! Mất một tim, thử lại nhé.", index });
    submit({ type: "answer", questionIndex: index, selected: option.word });
  }, [paused, currentWord, quiet, submit, index]);

  if (isCountdown) return <section aria-label="Chuẩn bị Word Blast">
    <MultiplayerCountdown countdownEndsAt={room.countdownEndsAt ?? 0} now={now} gameMode="blast" roomCode={roomCode} players={players} currentUserId={currentUserId} muted={quiet} clockPending={!race.isClockReady} />
    {race.clockError && <div role="alert" className="mt-3 text-sm text-danger-ink"><p>{race.clockError}</p><button type="button" className={styles.button} onClick={retrySync}>Thử kết nối lại</button></div>}
    <button type="button" className={`${styles.button} mt-3`} onClick={onExit}>Rời phòng</button>
  </section>;

  const sync = <>{pendingCount > 0 && <p className="text-xs text-muted" role="status">Đang đồng bộ {pendingCount} lượt chơi…</p>}{syncError && <div role="alert" className="text-sm text-danger-ink"><p>{syncError}</p><button type="button" className={styles.button} onClick={retrySync}>Thử đồng bộ lại</button></div>}</>;
  if (isFinished || isPlayerFinished || matchRemaining === 0) {
    const ranked = [...players].sort(compareRacePlayers);
    const first = ranked[0];
    const winners = first ? ranked.filter((entry) => entry.score === first.score && (entry.correctCount ?? 0) === (first.correctCount ?? 0)) : [];
    return <section className={`${styles.arcadeRound} p-6 text-center`} aria-label="Kết quả Word Blast">
      <h2 className="text-2xl font-black text-ink">{isFinished || matchRemaining === 0 ? "Tổng kết trận đấu" : "Bạn đã hoàn thành lượt chơi"}</h2>
      {!isFinished && matchRemaining > 0 && <p className="mt-2 text-muted">Đối thủ vẫn đang chơi. Theo dõi cuộc đua điểm trực tiếp bên dưới.</p>}
      <p className="my-4 text-ink">{player?.score ?? 0} điểm · {player?.correctCount ?? 0} câu đúng · Combo cao nhất {player?.maxCombo ?? 0}</p>
      <MultiplayerScoreboard players={players} currentUserId={currentUserId} />
      {isFinished && winners.length > 0 && <p className="my-4 font-bold text-primary-ink">{winners.length > 1 ? "Đồng chiến thắng" : "Người chiến thắng"}: {winners.map((winner) => winner.displayName).join(", ")}</p>}
      {sync}
      {resetError && <p role="alert" className="text-danger-ink">{resetError}</p>}
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {isFinished && player?.isHost ? <button type="button" className={styles.button} disabled={resetting || pendingCount > 0} onClick={() => { void returnToLobby(); }}>{resetting ? "Đang trở lại phòng…" : "Chơi lại"}</button> : <p className="text-sm text-muted">{isFinished ? "Chờ chủ phòng bắt đầu trận mới." : `Trận đấu còn ${matchRemaining} giây.`}</p>}
        <button type="button" className={styles.button} onClick={onExit}>Rời phòng</button>
      </div>
    </section>;
  }
  return <section className={`${styles.arcadeRound} relative`} aria-label="Word Blast Đối Kháng">
    <header className={styles.toolbar}><div><span className={styles.eyebrow}>ĐUA ĐIỂM TRỰC TIẾP · PHÒNG #{roomCode}</span><h2 className="text-xl font-bold text-ink">Word Blast — Đua điểm</h2></div><div className="flex gap-2"><button type="button" className={styles.button} onClick={() => setQuiet((value) => !value)}>{quiet ? "Bật âm thanh" : "Tắt âm thanh"}</button><button type="button" className={styles.button} onClick={onExit}>Rời phòng</button></div></header>
    <MultiplayerScoreboard players={players} currentUserId={currentUserId} />
    <div className={`${styles.arcade} ${styles.blastArena}`}>
      <div className={styles.scoreboard}><span className={styles.hearts} aria-label={`Còn ${player?.lives ?? 0} mạng`}>{"❤️".repeat(Math.max(0, Math.min(3, player?.lives ?? 0)))}</span><span>Câu {Math.min(index + 1, words.length)}/{words.length}</span><span>⏳ {remaining}s</span><strong>{player?.score ?? 0} điểm</strong><span>{player?.correctCount ?? 0} đúng · Combo {player?.combo ?? 0}</span><strong className="text-amber-300" aria-label="Hệ số combo">×{raceComboMultiplier(player?.combo ?? 0)}</strong><span>Trận: {matchRemaining}s</span></div>
      <p className="px-3 text-center text-xs text-cyan-100/80">Mỗi câu đúng: 10 điểm × hệ số combo, tối đa ×4. Sai mất một tim và đặt lại combo.</p>
      <div className={styles.blastClue}><p>&gt; TÌM TỪ TIẾNG ANH TƯƠNG ỨNG</p><h3 className="text-2xl font-extrabold">“{currentWord?.meaning}”</h3><small>{feedback && (feedback.index === index || now < startsAt) ? feedback.message : "Mỗi người chơi theo nhịp riêng. Đúng liên tiếp để tăng combo."}</small></div>
      <BlastField key={index} options={options} correctId={currentWord?.id} disabledAnswers={player?.disabledAnswers ?? []} blocked={paused} onSelect={select} />
    </div>
    {sync}
  </section>;
}
