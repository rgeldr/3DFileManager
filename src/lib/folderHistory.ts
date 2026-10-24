import type { Browse } from "../types";

export interface FolderHistory {
  back: Browse[];
  current: Browse;
  forward: Browse[];
}

export const HISTORY_CLICK_GAP_MS = 80;

export function emptyHistory(): FolderHistory {
  return { back: [], current: { type: "root" }, forward: [] };
}

export function samePlace(a: Browse, b: Browse): boolean {
  if (a.type === "root" || b.type === "root") return a.type === b.type;
  return a.id === b.id;
}

export function pushFolder(history: FolderHistory, next: Browse): FolderHistory {
  if (samePlace(history.current, next)) return history;
  return { back: [...history.back, history.current], current: next, forward: [] };
}

function placeExists(place: Browse, exists: (id: number) => boolean): boolean {
  return place.type === "root" || exists(place.id);
}

/** Move one step. Missing folders on the way are dropped and not pushed onto the other stack. */
export function moveHistory(
  history: FolderHistory,
  direction: "back" | "forward",
  exists: (id: number) => boolean,
): FolderHistory {
  const source = direction === "back" ? history.back : history.forward;
  let landing = -1;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    if (placeExists(source[index], exists)) {
      landing = index;
      break;
    }
  }
  if (landing < 0) {
    const kept = source.filter((place) => placeExists(place, exists));
    if (kept.length === source.length) return history;
    return direction === "back" ? { ...history, back: kept } : { ...history, forward: kept };
  }
  const next = source[landing];
  const kept = source.slice(0, landing);
  if (direction === "back") {
    return { back: kept, current: next, forward: [...history.forward, history.current] };
  }
  return { back: [...history.back, history.current], current: next, forward: kept };
}

export function historyButton(button: number): "back" | "forward" | null {
  if (button === 3) return "back";
  if (button === 4) return "forward";
  return null;
}

export function historyKey(event: { altKey: boolean; key: string }): "back" | "forward" | null {
  if (!event.altKey) return null;
  if (event.key === "ArrowLeft") return "back";
  if (event.key === "ArrowRight") return "forward";
  return null;
}

export function acceptHistoryClick(now: number, last: number, gap = HISTORY_CLICK_GAP_MS): boolean {
  return now - last >= gap;
}
