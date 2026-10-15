import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThumbQueueCount } from "./useThumbQueueCount";

const pendingThumbnailCount = vi.fn();

vi.mock("../api", () => ({
  api: {
    pendingThumbnailCount: () => pendingThumbnailCount(),
  },
}));

describe("useThumbQueueCount", () => {
  beforeEach(() => {
    pendingThumbnailCount.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls and updates when the count changes", async () => {
    pendingThumbnailCount.mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    const { result } = renderHook(() => useThumbQueueCount(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current).toBe(3);
    expect(pendingThumbnailCount).toHaveBeenCalledTimes(2);
  });

  it("resets to zero when disabled", async () => {
    let resolveLate: (value: number) => void = () => undefined;
    pendingThumbnailCount.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolveLate = resolve;
        }),
    );
    const { result, rerender } = renderHook(({ enabled }) => useThumbQueueCount(enabled), {
      initialProps: { enabled: true },
    });
    rerender({ enabled: false });
    expect(result.current).toBe(0);
    resolveLate(5);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(0);
  });
});
