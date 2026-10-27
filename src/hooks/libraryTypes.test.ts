import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyProgress,
  ERROR_MESSAGE_MAX,
  formatBytes,
  formatErrorForDisplay,
} from "./libraryTypes";

const dragIconPath = vi.fn();

vi.mock("../api", () => ({
  api: {
    dragIconPath: () => dragIconPath(),
  },
}));

afterEach(() => {
  dragIconPath.mockReset();
  vi.resetModules();
});

describe("libraryTypes helpers", () => {
  it("formatBytes scales through units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(10 * 1024)).toBe("10 KB");
    expect(formatBytes(1024 ** 2 * 1.5)).toBe("1.5 MB");
    expect(formatBytes(1024 ** 5)).toContain("TB");
  });

  it("formatErrorForDisplay truncates long messages", () => {
    const exact = "x".repeat(ERROR_MESSAGE_MAX);
    expect(formatErrorForDisplay(exact)).toBe(exact);
    const long = "x".repeat(ERROR_MESSAGE_MAX + 1);
    expect(formatErrorForDisplay(long)).toMatch(/…\(truncated\)$/);
  });

  it("emptyProgress returns a fresh object each call", () => {
    const a = emptyProgress();
    const b = emptyProgress();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("fallbackDragIconPath shares one in-flight request", async () => {
    dragIconPath.mockResolvedValue("/icon.png");
    const { fallbackDragIconPath } = await import("./libraryTypes");
    const [a, b] = await Promise.all([fallbackDragIconPath(), fallbackDragIconPath()]);
    expect(a).toBe("/icon.png");
    expect(b).toBe("/icon.png");
    expect(dragIconPath).toHaveBeenCalledTimes(1);
  });

  it("fallbackDragIconPath retries after rejection", async () => {
    dragIconPath.mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce("/retry.png");
    const { fallbackDragIconPath } = await import("./libraryTypes");
    await expect(fallbackDragIconPath()).rejects.toThrow("nope");
    await expect(fallbackDragIconPath()).resolves.toBe("/retry.png");
    expect(dragIconPath).toHaveBeenCalledTimes(2);
  });
});
