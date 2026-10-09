import { doc, onSnapshot } from "firebase/firestore";
import { getClientDb } from "./firebase/client";
import { COLLECTIONS } from "./firestore/collections";

type Handlers<Room, Player> = {
  room: (room: Room) => void;
  players: (players: Player[]) => void;
  identity?: (uid: string) => void;
};

/** One realtime transport. HTTP is a bounded fallback, never a second live feed. */
export function subscribeGameRoom<Room, Player>(code: string, handlers: Handlers<Room, Player>): () => void {
  let stopped = false;
  let fallback = false;
  let roomReady = false;
  let delay = 2_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let subscriptions: (() => void)[] = [];
  let generation = 0;

  const detach = () => {
    subscriptions.forEach((unsubscribe) => unsubscribe());
    subscriptions = [];
    clearTimeout(timer);
    request?.abort();
  };
  const schedulePoll = () => {
    if (!stopped && fallback && !document.hidden) timer = setTimeout(() => void poll(), delay);
  };
  const poll = async () => {
    if (stopped || document.hidden) return;
    const currentGeneration = generation;
    request = new AbortController();
    try {
      const response = await fetch(`/api/vocab/game-room?code=${encodeURIComponent(code)}`, {
        signal: request.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        delay = Math.min(60_000, Math.max(delay * 2, Number.isFinite(retryAfter) ? retryAfter * 1_000 : 0));
        return;
      }
      const json = await response.json();
      if (stopped || document.hidden || currentGeneration !== generation) return;
      if (json.success && json.data) {
        if (json.data.room) handlers.room(json.data.room);
        if (json.data.players) handlers.players(json.data.players);
        if (json.data.currentUserId) handlers.identity?.(json.data.currentUserId);
        delay = 2_000;
      } else {
        delay = Math.min(60_000, delay * 2);
      }
    } catch {
      delay = Math.min(60_000, delay * 2);
    } finally {
      if (currentGeneration === generation) schedulePoll();
    }
  };
  const startFallback = () => {
    if (stopped || fallback) return;
    fallback = true;
    detach();
    schedulePoll();
  };
  const start = () => {
    if (stopped || document.hidden) return;
    fallback = false;
    roomReady = false;
    const ready = () => { if (roomReady) clearTimeout(timer); };
    try {
      const db = getClientDb();
      // New rooms carry a compact scoreboard in the room document. Legacy
      // rooms without it use bounded HTTP fallback instead of a second listener.
      subscriptions.push(onSnapshot(doc(db, COLLECTIONS.gameRooms, code), (snapshot) => {
        roomReady = true;
        ready();
        if (snapshot.exists()) {
          const data = snapshot.data() as Room & { playerSummaries?: Player[] };
          handlers.room(data);
          if (Array.isArray(data.playerSummaries)) handlers.players(data.playerSummaries);
          else startFallback();
        }
      }, startFallback));
      // A blocked client SDK must not leave a lobby permanently loading.
      if (!roomReady) timer = setTimeout(startFallback, 4_000);
    } catch {
      startFallback();
    }
  };
  const visibilityChanged = () => {
    generation++;
    detach();
    if (!document.hidden) start();
  };
  document.addEventListener("visibilitychange", visibilityChanged);
  start();
  return () => {
    stopped = true;
    generation++;
    detach();
    document.removeEventListener("visibilitychange", visibilityChanged);
  };
}
