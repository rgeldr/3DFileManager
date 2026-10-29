import { describe, expect, it } from "vitest";
import {
  acceptHistoryClick,
  emptyHistory,
  historyButton,
  historyKey,
  moveHistory,
  placeExists,
  pushFolder,
  samePlace,
} from "./folderHistory";

const root = { type: "root" as const };
const folder = (id: number) => ({ type: "folder" as const, id });
const all = (id: number) => id > 0;

describe("samePlace and placeExists", () => {
  it("treats the root as one place and folders by id", () => {
    expect(samePlace(root, root)).toBe(true);
    expect(samePlace(root, folder(1))).toBe(false);
    expect(samePlace(folder(1), folder(1))).toBe(true);
    expect(samePlace(folder(1), folder(2))).toBe(false);
    expect(placeExists(root, () => false)).toBe(true);
    expect(placeExists(folder(4), (id) => id === 4)).toBe(true);
    expect(placeExists(folder(4), () => false)).toBe(false);
  });
});

describe("folder history", () => {
  it("starts at the library root", () => {
    expect(emptyHistory()).toEqual({ back: [], current: root, forward: [] });
  });

  it("pushes the previous folder and clears the forward stack", () => {
    const visited = pushFolder(pushFolder(emptyHistory(), folder(1)), folder(2));
    const branched = pushFolder(moveHistory(visited, "back", all), folder(3));
    expect(branched).toEqual({
      back: [root, folder(1)],
      current: folder(3),
      forward: [],
    });
  });

  it("does not push when the folder is already current", () => {
    const start = emptyHistory();
    const visited = pushFolder(start, folder(1));
    expect(pushFolder(visited, folder(1))).toBe(visited);
    expect(pushFolder(start, root)).toBe(start);
  });

  it("walks back and forward without adding entries", () => {
    const visited = pushFolder(pushFolder(emptyHistory(), folder(1)), folder(2));
    const back = moveHistory(visited, "back", all);
    expect(back).toEqual({ back: [root], current: folder(1), forward: [folder(2)] });
    expect(moveHistory(back, "forward", all)).toEqual(visited);
    const start = emptyHistory();
    expect(moveHistory(start, "back", all)).toBe(start);
  });

  it("skips folders that no longer exist", () => {
    const visited = pushFolder(pushFolder(pushFolder(emptyHistory(), folder(1)), folder(2)), folder(3));
    const exists = (id: number) => id !== 2 && id !== 1;
    expect(moveHistory(visited, "back", exists)).toEqual({
      back: [],
      current: root,
      forward: [folder(3)],
    });
  });

  it("drops a missing forward stack and stays put", () => {
    const back = moveHistory(pushFolder(emptyHistory(), folder(4)), "back", all);
    const stuck = moveHistory(back, "forward", () => false);
    expect(stuck.current).toEqual(root);
    expect(stuck.forward).toEqual([]);
    expect(moveHistory(stuck, "forward", () => false)).toBe(stuck);
  });

  it("maps mouse buttons and Alt+arrows", () => {
    expect(historyButton(3)).toBe("back");
    expect(historyButton(4)).toBe("forward");
    expect(historyButton(0)).toBeNull();
    expect(historyKey({ altKey: true, key: "ArrowLeft" })).toBe("back");
    expect(historyKey({ altKey: true, key: "ArrowRight" })).toBe("forward");
    expect(historyKey({ altKey: false, key: "ArrowLeft" })).toBeNull();
  });

  it("accepts one click from a pointerup and mouseup pair", () => {
    expect(acceptHistoryClick(1000, 0)).toBe(true);
    expect(acceptHistoryClick(1040, 1000)).toBe(false);
    expect(acceptHistoryClick(1080, 1000)).toBe(true);
  });
});
