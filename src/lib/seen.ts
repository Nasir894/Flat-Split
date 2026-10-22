// "Last seen" markers for the unread dots on the chat and activity buttons (per device).
export type SeenKey = "chat" | "activity";
const key = (k: SeenKey) => `fs_seen_${k}`;
export const SEEN_EVENT = "fs-seen";

export function getSeen(k: SeenKey): number {
  try {
    return Number(localStorage.getItem(key(k))) || 0;
  } catch {
    return 0;
  }
}

export function markSeen(k: SeenKey, id: number | undefined | null) {
  if (!id || id <= getSeen(k)) return;
  try {
    localStorage.setItem(key(k), String(id));
  } catch {}
  window.dispatchEvent(new Event(SEEN_EVENT));
}
