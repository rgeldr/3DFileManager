import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileRow } from "../types";
import { useFileDrag } from "./useFileDrag";

const startDrag = vi.fn();
const prepareDragPaths = vi.fn();
const moveFiles = vi.fn();

vi.mock("@crabnebula/tauri-plugin-drag", () => ({
  startDrag: (...args: unknown[]) => startDrag(...args),
}));

vi.mock("../api", () => ({
  api: {
    prepareDragPaths: (...args: unknown[]) => prepareDragPaths(...args),
    moveFiles: (...args: unknown[]) => moveFiles(...args),
  },
}));

vi.mock("../debugLog", () => ({
  debugLog: () => undefined,
}));

afterEach(() => {
  startDrag.mockReset();
  prepareDragPaths.mockReset();
  moveFiles.mockReset();
  vi.restoreAllMocks();
});

function file(overrides: Partial<FileRow> = {}): FileRow {
  return {
    id: 1,
    originalName: "a.stl",
    sortName: "a",
    storedRelpath: "a.stl",
    ext: "stl",
    sizeBytes: 10,
    sha256: "abc",
    folderId: null,
    creator: "",
    notes: "",
    sourceArchive: null,
    importedAt: 1,
    mtime: 1,
    thumbStatus: "ok",
    missing: false,
    tags: [],
    absolutePath: "/library/a.stl",
    thumbPath: null,
    ...overrides,
  };
}

function bag(overrides: Record<string, unknown> = {}) {
  const dragRef = { current: null as ReturnType<typeof useFileDrag> extends never ? never : import("./libraryTypes").FileDrag | null };
  const filesRef = { current: [file({ id: 1 }), file({ id: 2, sortName: "b", originalName: "b.stl", absolutePath: "/library/b.stl" })] };
  const tryStartRef = { current: () => undefined };
  const prefetchRef = { current: (_ids: number[]) => undefined };
  const dragPrepCache = { current: null as null | { key: string; paths: string[]; skipped: string[]; reports: never[] } };
  const dragIconRef = { current: "/icon.png" as string | null };
  const setDragFailure = vi.fn();
  const runDiskOp = vi.fn(async () => undefined);
  const showToast = vi.fn();
  return {
    dragRef,
    filesRef,
    tryStartRef,
    prefetchRef,
    dragPrepCache,
    dragIconRef,
    selected: [1],
    showToast,
    setDragFailure,
    runDiskOp,
    ...overrides,
  };
}

describe("useFileDrag", () => {
  it("reports prep failure through setDragFailure when paths stay empty", async () => {
    prepareDragPaths.mockRejectedValue(new Error("prep blew up"));
    const state = bag();
    const { result } = renderHook(() => useFileDrag(state));

    const tile = document.createElement("div");
    tile.setAttribute("data-file-id", "1");
    document.body.appendChild(tile);
    tile.setPointerCapture = vi.fn();
    tile.hasPointerCapture = vi.fn(() => false);
    tile.releasePointerCapture = vi.fn();

    act(() => {
      result.current.onPointerDown({
        button: 0,
        pointerId: 1,
        clientX: 40,
        clientY: 40,
        target: tile,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    await waitFor(() => expect(state.dragRef.current?.pathsReady).toBe(true));
    expect(state.dragRef.current?.prepareError).toMatch(/prep blew up/);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: -2,
          clientY: 40,
          buttons: 1,
          bubbles: true,
        }),
      );
    });

    await waitFor(() => expect(state.setDragFailure).toHaveBeenCalled());
    expect(state.setDragFailure).toHaveBeenCalledWith({
      message: expect.stringMatching(/prep blew up/),
      fileId: 1,
    });
    tile.remove();
  });

  it("moves files with runDiskOp when the pointer is released over a folder", async () => {
    prepareDragPaths.mockResolvedValue({ paths: ["/tmp/a.stl"], skipped: [], reports: [] });
    moveFiles.mockResolvedValue({ cancelled: false });
    const state = bag();
    const { result } = renderHook(() => useFileDrag(state));

    const tile = document.createElement("div");
    tile.setAttribute("data-file-id", "1");
    document.body.appendChild(tile);
    tile.setPointerCapture = vi.fn();
    tile.hasPointerCapture = vi.fn(() => false);
    tile.releasePointerCapture = vi.fn();

    const folder = document.createElement("div");
    folder.setAttribute("data-folder-id", "9");
    document.body.appendChild(folder);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => folder,
    });

    act(() => {
      result.current.onPointerDown({
        button: 0,
        pointerId: 3,
        clientX: 50,
        clientY: 50,
        target: tile,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 3,
          clientX: 80,
          clientY: 90,
          buttons: 1,
          bubbles: true,
        }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: 3,
          clientX: 80,
          clientY: 90,
          bubbles: true,
        }),
      );
    });

    await waitFor(() => expect(state.runDiskOp).toHaveBeenCalled());
    const call = state.runDiskOp.mock.calls[0]?.[0] as {
      title: string;
      run: () => Promise<unknown>;
    };
    expect(call.title).toMatch(/Moving/);
    await call.run();
    expect(moveFiles).toHaveBeenCalledWith([1], 9);
    tile.remove();
    folder.remove();
  });
});
