export type OnlinePresence = { dateKey: string; seconds: number; totalSeconds: number; running: boolean; synced: boolean };
export const ONLINE_PRESENCE_EVENT = "englishgo:online-presence";
const snapshots = new Map<string, OnlinePresence>();

export function readOnlinePresence(uid: string) { return snapshots.get(uid); }
export function publishOnlinePresence(uid: string, value: OnlinePresence) {
  snapshots.set(uid, value);
  window.dispatchEvent(new CustomEvent(ONLINE_PRESENCE_EVENT, { detail: { uid } }));
}
export function onlineTimeLabel(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
