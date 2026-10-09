"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeGameRoom } from "@/lib/game-room-subscription";
import { advanceRacePlayer, createRacePlayer, type RaceEvent, type RacePlayer, type RaceRoom } from "@/lib/vocab-race";

type Options = { roomCode: string; initialRoom: RaceRoom; initialPlayers: Array<Partial<RacePlayer> & { uid: string }>; currentUserId: string; onReturnToLobby?: () => void };
function normalizePlayer(value: Partial<RacePlayer> & { uid: string }, room: RaceRoom): RacePlayer {
  const initial = createRacePlayer(value, room);
  return value.runId === room.runId ? { ...initial, ...value } : initial;
}

/** Only rankings travel over realtime; each arena predicts its own ordered moves. */
export function useVocabRace({ roomCode, initialRoom, initialPlayers, currentUserId, onReturnToLobby }: Options) {
  const [initial] = useState(() => {
    const clientNow = Date.now();
    return {
      player: normalizePlayer(initialPlayers.find((value) => value.uid === currentUserId) ?? { uid: currentUserId }, initialRoom),
      offset: typeof initialRoom.serverNow === "number" ? initialRoom.serverNow - clientNow : 0,
      now: initialRoom.serverNow ?? clientNow,
    };
  });
  const [room, setRoom] = useState(initialRoom);
  const [player, setPlayer] = useState<RacePlayer>(initial.player);
  const [players, setPlayers] = useState<RacePlayer[]>(() => initialPlayers.map((value) => normalizePlayer(value, initialRoom)));
  const [pendingCount, setPendingCount] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [clockError, setClockError] = useState("");
  const [isClockReady, setClockReady] = useState(typeof initialRoom.serverNow === "number");
  const offset = useRef(initial.offset);
  const clockReady = useRef(typeof initialRoom.serverNow === "number");
  const [now, setNow] = useState(initial.now);
  const roomRef = useRef(initialRoom);
  const uidRef = useRef(currentUserId);
  const confirmed = useRef<RacePlayer>(initial.player);
  const local = useRef<RacePlayer>(initial.player);
  const queue = useRef<RaceEvent[]>([]);
  const active = useRef(true);
  const busy = useRef(false);
  const failures = useRef(0);
  const lastSentAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef<AbortController | undefined>(undefined);
  const pumpRef = useRef<() => void>(() => {});
  const clockLookupRef = useRef<() => void>(() => {});
  const lobbyCallback = useRef(onReturnToLobby);
  useEffect(() => { lobbyCallback.current = onReturnToLobby; }, [onReturnToLobby]);

  const storageKey = useCallback(() => `vocab-race:${roomCode}:${roomRef.current.runId}:${uidRef.current}`, [roomCode]);
  const publish = useCallback(() => {
    let predicted = confirmed.current;
    queue.current = queue.current.filter((event) => event.seq > predicted.revision);
    for (const event of queue.current) {
      try { predicted = advanceRacePlayer(predicted, event, roomRef.current.words, roomRef.current.gameMode, roomRef.current.questionDurationMs); }
      catch { setSyncError("Tiến độ chưa khớp. Bấm thử đồng bộ lại."); break; }
    }
    local.current = predicted;
    if (!active.current) return;
    setPlayer(predicted);
    setPendingCount(queue.current.length);
    setPlayers((previous) => previous.some((value) => value.uid === predicted.uid)
      ? previous.map((value) => value.uid === predicted.uid ? predicted : value)
      : [...previous, predicted]);
    try {
      if (queue.current.length) sessionStorage.setItem(storageKey(), JSON.stringify(queue.current));
      else sessionStorage.removeItem(storageKey());
    } catch { /* Storage may be disabled; the in-memory queue still retries. */ }
  }, [storageKey]);

  const acceptPlayer = useCallback((value: RacePlayer) => {
    if (value.uid !== uidRef.current || value.runId !== roomRef.current.runId || value.revision < confirmed.current.revision) return;
    confirmed.current = normalizePlayer(value, roomRef.current);
    publish();
  }, [publish]);

  const schedule = useCallback((delay = 250) => {
    if (!active.current || busy.current || timer.current || !queue.current.length || failures.current >= 5) return;
    const wait = Math.max(delay, 1_000 - (Date.now() - lastSentAt.current));
    timer.current = setTimeout(() => { timer.current = undefined; pumpRef.current(); }, wait);
  }, []);

  const pump = useCallback(async () => {
    if (!active.current || busy.current || !queue.current.length) return;
    busy.current = true;
    lastSentAt.current = Date.now();
    const runId = roomRef.current.runId;
    const sentUid = uidRef.current;
    const batch = queue.current.slice(0, 20);
    const controller = new AbortController();
    request.current = controller;
    const deadline = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/vocab/game-room/answer", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ code: roomCode, runId, events: batch }),
      });
      const result = await response.json();
      if (!active.current || runId !== roomRef.current.runId || sentUid !== uidRef.current) return;
      if (!response.ok || !result.success) throw new Error("Sync failed");
      const data = result.data;
      if (data?.runId && data.runId !== runId) throw new Error("Run changed");
      if (!data?.player || typeof data.player.revision !== "number" || data.player.uid !== sentUid || data.player.runId !== runId) throw new Error("Missing acknowledgement");
      acceptPlayer(data.player);
      if (data.skipped && ["Race deadline passed", "Race is not active"].includes(data.reason)) {
        queue.current = [];
        publish();
        setSyncError("Một số kết quả đến sau khi trận đã chốt. Điểm hiển thị là điểm đã được xác nhận.");
        return;
      }
      if (queue.current.some((event) => event.seq <= batch[batch.length - 1].seq)) throw new Error("Unacknowledged events");
      failures.current = 0;
      setSyncError("");
      if (data.status === "finished") {
        roomRef.current = { ...roomRef.current, status: "finished" };
        setRoom(roomRef.current);
      }
    } catch {
      if (!active.current) return;
      failures.current++;
      setSyncError("Kết quả đang chờ đồng bộ. Bạn có thể thử lại khi mạng ổn định.");
    } finally {
      clearTimeout(deadline);
      busy.current = false;
      request.current = undefined;
      schedule(failures.current ? Math.min(4_000, 500 * 2 ** failures.current) : 250);
    }
  }, [roomCode, acceptPlayer, schedule, publish]);
  useEffect(() => { pumpRef.current = () => { void pump(); }; }, [pump]);

  const submit = useCallback((input: { type: RaceEvent["type"]; questionIndex: number; selected?: string }) => {
    const currentRoom = roomRef.current;
    if (!clockReady.current || !uidRef.current || !currentRoom.runId || currentRoom.status === "waiting" || currentRoom.status === "finished" || local.current.status !== "playing") return;
    const at = Date.now() + offset.current;
    if (at < (currentRoom.countdownEndsAt ?? 0)) return;
    const atEnd = currentRoom.matchEndsAt != null && at >= currentRoom.matchEndsAt;
    if (input.type === "finish" && !atEnd) return;
    const event: RaceEvent = { ...input, type: atEnd ? "finish" : input.type, at: atEnd ? currentRoom.matchEndsAt! : at, seq: local.current.revision + 1 };
    try { advanceRacePlayer(local.current, event, currentRoom.words, currentRoom.gameMode, currentRoom.questionDurationMs); }
    catch { return; }
    queue.current.push(event);
    publish();
    schedule();
  }, [publish, schedule]);

  useEffect(() => {
    active.current = true;
    let lastFinalization = 0;
    let finalizationBusy = false;
    let finalizationRequest: AbortController | undefined;
    const clock = setInterval(() => {
      const serverTime = Date.now() + offset.current;
      setNow(serverTime);
      if (clockReady.current && roomRef.current.matchEndsAt && serverTime >= roomRef.current.matchEndsAt && local.current.status === "playing") {
        submit({ type: "finish", questionIndex: local.current.currentIndex });
      }
      if (clockReady.current && roomRef.current.matchEndsAt && serverTime >= roomRef.current.matchEndsAt + 15_000 && roomRef.current.status !== "finished" && !finalizationBusy && serverTime - lastFinalization >= 3_000) {
        lastFinalization = serverTime; finalizationBusy = true;
        const controller = new AbortController();
        finalizationRequest = controller;
        const deadline = setTimeout(() => controller.abort(), 15_000);
        void fetch(`/api/vocab/game-room?code=${encodeURIComponent(roomCode)}`, { signal: controller.signal })
          .then(async (response) => response.ok ? response.json() : null)
          .then((result) => { if (active.current && result?.success && result.data?.room) { acceptRoom(result.data.room); if (Array.isArray(result.data.players)) acceptPlayers(result.data.players); } })
          .catch(() => undefined).finally(() => { clearTimeout(deadline); finalizationBusy = false; });
      }
    }, 100);
    // A hard refresh can retry immutable events without awarding them twice.
    queueMicrotask(() => {
    if (!active.current) return;
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey()) ?? "[]");
      if (Array.isArray(saved)) {
        const valid = saved.filter((event): event is RaceEvent => event && Number.isSafeInteger(event.seq) && event.seq >= 1 && Number.isSafeInteger(event.questionIndex) && event.questionIndex >= 0 && event.questionIndex < roomRef.current.words.length && Number.isFinite(event.at) && ["answer", "timeout", "finish"].includes(event.type) && (event.selected == null || typeof event.selected === "string"));
        let state = confirmed.current;
        for (const event of valid.filter((value) => value.seq > state.revision)) { state = advanceRacePlayer(state, event, roomRef.current.words, roomRef.current.gameMode, roomRef.current.questionDurationMs); }
        queue.current = valid;
      }
      publish(); schedule();
    } catch { /* Invalid local data is ignored. */ }
    });
    const acceptRoom = (value: RaceRoom) => {
      if (!active.current || value.code !== roomCode) return;
      if (typeof value.updatedAt === "number" && typeof roomRef.current.updatedAt === "number" && value.updatedAt < roomRef.current.updatedAt) return;
      if (value.status === "waiting" && value.runId && value.runId !== roomRef.current.runId) return;
      if (value.status === "waiting") {
        if (roomRef.current.runId && (typeof value.updatedAt !== "number" || value.updatedAt <= (roomRef.current.updatedAt ?? 0))) return;
        lobbyCallback.current?.(); return;
      }
      if (roomRef.current.runId && value.runId !== roomRef.current.runId) {
        if (value.runId && (value.updatedAt ?? 0) > (roomRef.current.updatedAt ?? Infinity)) lobbyCallback.current?.();
        return;
      }
      if (roomRef.current.status === "finished" && value.status !== "finished") return;
      roomRef.current = { ...roomRef.current, ...value };
      setRoom(roomRef.current);
    };
    const acceptPlayers = (values: RacePlayer[]) => {
      if (!active.current) return;
      const fresh = values.filter((value) => value.runId === roomRef.current.runId);
      if (!fresh.length) return;
      setPlayers((previous) => fresh.map((value) => {
        const old = previous.find((entry) => entry.uid === value.uid);
        return old && old.runId === value.runId && old.revision > value.revision ? old : value;
      }));
      const own = fresh.find((value) => value.uid === uidRef.current);
      // Scoreboard projections cannot acknowledge moves: they omit the current
      // question and drops. Only a full server player can rebase our queue.
      if (own && typeof own.currentIndex === "number" && typeof own.questionStartedAt === "number" && Array.isArray(own.activeDrops) && Array.isArray(own.disabledAnswers)) acceptPlayer(own);
      else publish();
    };
    const unsubscribe = subscribeGameRoom<RaceRoom, RacePlayer>(roomCode, { room: acceptRoom, players: acceptPlayers });
    const lookupRunId = roomRef.current.runId;
    let clockRequest: AbortController | undefined;
    let clockTimer: ReturnType<typeof setTimeout> | undefined;
    let clockFailures = 0;
    let clockBusy = false;
    let disposed = false;
    const lookupClock = async () => {
      if (disposed || clockBusy || lookupRunId !== roomRef.current.runId) return;
      clockBusy = true;
      const started = Date.now();
      const controller = new AbortController();
      clockRequest = controller;
      const deadline = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`/api/vocab/game-room?code=${encodeURIComponent(roomCode)}`, { signal: controller.signal });
        const result = response.ok ? await response.json() : null;
        if (disposed || !active.current || lookupRunId !== roomRef.current.runId) return;
        if (!result?.success || !result.data?.room || result.data.room.code !== roomCode || result.data.room.runId !== lookupRunId) throw new Error("Room lookup failed");
        const data = result.data;
        const serverNow = data.serverNow ?? data.room.serverNow;
        if (typeof serverNow !== "number" || !Number.isFinite(serverNow)) throw new Error("Clock unavailable");
        offset.current = serverNow - (started + Date.now()) / 2;
        clockReady.current = true; setClockReady(true); setClockError("");
        setNow(Date.now() + offset.current);
        if (data.currentUserId && data.currentUserId !== uidRef.current) {
          uidRef.current = data.currentUserId; queue.current = [];
          confirmed.current = normalizePlayer(data.players?.find((value: RacePlayer) => value.uid === data.currentUserId) ?? { uid: data.currentUserId }, data.room);
        }
        acceptRoom(data.room);
        if (Array.isArray(data.players)) acceptPlayers(data.players);
        clockFailures = 0;
      } catch {
        if (disposed || !active.current) return;
        clockFailures++;
        if (!clockReady.current) setClockError(clockFailures < 5
          ? "Chưa kết nối được với trận đấu. Đang thử lại; bạn cũng có thể bấm kết nối lại."
          : "Chưa kết nối được với trận đấu. Bấm kết nối lại để thử tiếp.");
        if (clockFailures < 5) clockTimer = setTimeout(() => { clockTimer = undefined; void lookupClock(); }, Math.min(4_000, 500 * 2 ** clockFailures));
      } finally {
        clearTimeout(deadline); clockBusy = false;
      }
    };
    clockLookupRef.current = () => {
      clearTimeout(clockTimer); clockTimer = undefined; clockFailures = 0;
      void lookupClock();
    };
    void lookupClock();
    return () => {
      active.current = false; unsubscribe(); clearInterval(clock); clearTimeout(timer.current);
      disposed = true; clearTimeout(clockTimer); clockLookupRef.current = () => {};
      timer.current = undefined; request.current?.abort(); clockRequest?.abort(); finalizationRequest?.abort();
    };
  }, [roomCode, acceptPlayer, publish, schedule, storageKey, submit]);

  const retrySync = useCallback(() => {
    failures.current = 0; setSyncError(""); schedule(0);
    if (!clockReady.current) clockLookupRef.current();
  }, [schedule]);
  const returnToLobby = useCallback(async () => {
    if (uidRef.current !== roomRef.current.hostId || resetting || queue.current.length) return;
    setResetting(true); setResetError("");
    try {
      const response = await fetch("/api/vocab/game-room/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: roomCode }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("Reset failed");
      lobbyCallback.current?.();
    } catch { setResetError("Chưa trở lại phòng chờ được. Hãy thử lại."); }
    finally { setResetting(false); }
  }, [roomCode, resetting]);
  return {
    room, players, player, words: room.words, now,
    isCountdown: !isClockReady || now < (room.countdownEndsAt ?? 0),
    isFinished: !room.runId || (room.status === "finished" && pendingCount === 0),
    isPlayerFinished: player.status === "finished" || player.status === "eliminated" || room.status === "finished",
    pendingCount, syncError, clockError, isClockReady, submit, retrySync, resetting, resetError, returnToLobby,
  };
}
