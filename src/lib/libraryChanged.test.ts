import { describe, expect, it, vi } from "vitest";
import {
  debounceLibraryChanged,
  mergeLibraryChangeKinds,
  shouldIgnoreLibraryChanged,
} from "./libraryChanged";

describe("libraryChanged", () => {
  it("ignores events from the same window", () => {
    expect(
      shouldIgnoreLibraryChanged({ kind: "files", sourceWindow: "win-1" }, "win-1"),
    ).toBe(true);
    expect(
      shouldIgnoreLibraryChanged({ kind: "files", sourceWindow: "win-1" }, "main"),
    ).toBe(false);
  });

  it("merges bursts toward the broadest refresh kind", () => {
    expect(mergeLibraryChangeKinds("files", "folders")).toBe("all");
    expect(mergeLibraryChangeKinds("tags", "tags")).toBe("tags");
    expect(mergeLibraryChangeKinds(null, "settings")).toBe("settings");
  });

  it("debounces rapid events to one callback", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const debounced = debounceLibraryChanged(
      (callback) => window.setTimeout(callback, 50),
      (id) => window.clearTimeout(id),
      50,
    );
    debounced.push("files", run);
    debounced.push("folders", run);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("all");
    vi.useRealTimers();
  });
});
