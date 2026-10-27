import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThumbPump } from "./useThumbPump";

const nextThumbnail = vi.fn();
const saveRenderedThumb = vi.fn();
const markThumbUnavailable = vi.fn();
const releaseRenderingThumb = vi.fn();
const renderMeshStill = vi.fn();

vi.mock("../api", () => ({
  api: {
    nextThumbnail: () => nextThumbnail(),
    saveRenderedThumb: (...args: unknown[]) => saveRenderedThumb(...args),
    markThumbUnavailable: (...args: unknown[]) => markThumbUnavailable(...args),
    releaseRenderingThumb: (...args: unknown[]) => releaseRenderingThumb(...args),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path,
}));

vi.mock("../lib/renderThumb", () => ({
  MESH_BYTE_LIMIT: 1000,
  renderMeshStill: (...args: unknown[]) => renderMeshStill(...args),
}));

vi.mock("../debugLog", () => ({ debugLog: () => undefined }));

function mountPump(overrides: Record<string, unknown> = {}) {
  const refresh = vi.fn(async () => undefined);
  const thumbGeneration = { current: 1 };
  return {
    refresh,
    thumbGeneration,
    props: {
      refreshListsRef: { current: refresh },
      thumbGeneration,
      ready: true,
      settings: { libraryRoot: "/lib" } as never,
      dialogOpen: false,
      thumbNonce: 0,
      ...overrides,
    },
  };
}

describe("useThumbPump", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nextThumbnail.mockReset();
    saveRenderedThumb.mockReset();
    markThumbUnavailable.mockReset();
    releaseRenderingThumb.mockReset();
    renderMeshStill.mockReset();
    saveRenderedThumb.mockResolvedValue(undefined);
    renderMeshStill.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not pump when idle preconditions fail", async () => {
    for (const props of [
      mountPump({ ready: false }).props,
      mountPump({ settings: { libraryRoot: null } }).props,
      mountPump({ dialogOpen: true }).props,
    ]) {
      renderHook(() => useThumbPump(props as never));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(64);
      });
    }
    expect(nextThumbnail).not.toHaveBeenCalled();
  });

  it("saves a rendered thumbnail under the byte limit", async () => {
    nextThumbnail
      .mockResolvedValueOnce({
        kind: "render",
        id: 4,
        absolutePath: "/x.stl",
        ext: "stl",
        sizeBytes: 10,
      })
      .mockResolvedValue(null);
    const { props } = mountPump();
    renderHook(() => useThumbPump(props as never));
    await pumpUntil(() => saveRenderedThumb.mock.calls.length > 0);
    expect(renderMeshStill).toHaveBeenCalled();
    expect(saveRenderedThumb).toHaveBeenCalledWith(4, [1, 2, 3]);
  });

  it("marks oversized meshes unavailable", async () => {
    nextThumbnail
      .mockResolvedValueOnce({
        kind: "render",
        id: 5,
        absolutePath: "/big.stl",
        ext: "stl",
        sizeBytes: 5000,
      })
      .mockResolvedValue(null);
    const { props } = mountPump();
    renderHook(() => useThumbPump(props as never));
    await pumpUntil(() => markThumbUnavailable.mock.calls.length > 0);
    expect(markThumbUnavailable).toHaveBeenCalledWith(5);
    expect(saveRenderedThumb).not.toHaveBeenCalled();
  });

  it("marks unavailable when rendering fails", async () => {
    renderMeshStill.mockRejectedValueOnce(new Error("bad mesh"));
    nextThumbnail
      .mockResolvedValueOnce({
        kind: "render",
        id: 6,
        absolutePath: "/x.stl",
        ext: "stl",
        sizeBytes: 10,
      })
      .mockResolvedValue(null);
    const { props } = mountPump();
    renderHook(() => useThumbPump(props as never));
    await pumpUntil(() => markThumbUnavailable.mock.calls.length > 0);
    expect(markThumbUnavailable).toHaveBeenCalledWith(6);
  });

  it("releases rendering work when the generation changes", async () => {
    let resolveRender!: () => void;
    renderMeshStill.mockImplementation(
      () =>
        new Promise<Uint8Array>((res) => {
          resolveRender = () => res(new Uint8Array([1]));
        }),
    );
    nextThumbnail.mockResolvedValueOnce({
      kind: "render",
      id: 7,
      absolutePath: "/x.stl",
      ext: "stl",
      sizeBytes: 10,
    });
    const { props, thumbGeneration } = mountPump();
    const { unmount } = renderHook(() => useThumbPump(props as never));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
      await Promise.resolve();
    });
    thumbGeneration.current += 1;
    unmount();
    resolveRender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
      await Promise.resolve();
    });
    expect(releaseRenderingThumb).toHaveBeenCalledWith(7);
    expect(saveRenderedThumb).not.toHaveBeenCalled();
  });

  it("refreshes after ten done jobs and when the queue empties", async () => {
    const doneJobs = Array.from({ length: 11 }, () => ({ kind: "done" as const }));
    nextThumbnail.mockImplementation(async () => doneJobs.shift() ?? null);
    const { props, refresh } = mountPump();
    renderHook(() => useThumbPump(props as never));
    await pumpUntil(() => refresh.mock.calls.length >= 2);
    expect(refresh.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

async function pumpUntil(done: () => boolean) {
  for (let i = 0; i < 40; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
      await Promise.resolve();
    });
    if (done()) return;
  }
  throw new Error("pump timed out");
}
