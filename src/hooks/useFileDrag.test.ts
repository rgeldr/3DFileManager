import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileRow } from "../types";
import { useFileDrag } from "./useFileDrag";

const startDrag = vi.fn();
const prepareDragPaths = vi.fn();
const moveFiles = vi.fn();
const moveFolder = vi.fn();

vi.mock("@crabnebula/tauri-plugin-drag", () => ({
  startDrag: (...args: unknown[]) => startDrag(...args),
}));

vi.mock("../api", () => ({
  api: {
    prepareDragPaths: (...args: unknown[]) => prepareDragPaths(...args),
    moveFiles: (...args: unknown[]) => moveFiles(...args),
    moveFolder: (...args: unknown[]) => moveFolder(...args),
  },
}));

vi.mock("../debugLog", () => ({
  debugLog: () => undefined,
}));

afterEach(() => {
  startDrag.mockReset();
  prepareDragPaths.mockReset();
  moveFiles.mockReset();
  moveFolder.mockReset();
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

function folderRow(id: number, parentId: number | null): import("../types").FolderRow {
  return { id, parentId, name: `f${id}`, relpath: `f${id}`, sortOrder: id };
}

function bag(overrides: Record<string, unknown> = {}) {
  const dragRef = { current: null as ReturnType<typeof useFileDrag> extends never ? never : import("./libraryTypes").FileDrag | null };
  const filesRef = { current: [file({ id: 1 }), file({ id: 2, sortName: "b", originalName: "b.stl", absolutePath: "/library/b.stl" })] };
  const tryStartRef = { current: () => undefined };
  const prefetchRef = { current: (_ids: number[]) => undefined };
  const dragPrepCache = { current: null as null | { key: string; paths: string[]; skipped: string[]; reports: never[] } };
  const dragIconRef = { current: "/icon.png" as string | null };
  const setDragFailure = vi.fn();
  const runDiskOp = vi.fn(async (_op: { title: string; run: () => Promise<unknown> }) => undefined);
  const showToast = vi.fn();
  const onMoveFolder = vi.fn();
  return {
    dragRef,
    filesRef,
    tryStartRef,
    prefetchRef,
    dragPrepCache,
    dragIconRef,
    selected: [1],
    folders: [folderRow(1, null), folderRow(2, 1), folderRow(5, null)],
    gridScrollRef: { current: null },
    onMoveFolder,
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

  it("moves a grid folder without prepareDragPaths, moveFiles, or startDrag", () => {
    const state = bag({ selected: [] });
    const { result } = renderHook(() => useFileDrag(state));

    const source = document.createElement("button");
    source.setAttribute("data-grid-folder", "5");
    source.setAttribute("data-folder-id", "5");
    document.body.appendChild(source);
    source.setPointerCapture = vi.fn();
    source.hasPointerCapture = vi.fn(() => false);
    source.releasePointerCapture = vi.fn();

    const target = document.createElement("div");
    target.setAttribute("data-folder-id", "2");
    document.body.appendChild(target);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => target,
    });

    act(() => {
      result.current.onPointerDown({
        button: 0,
        pointerId: 7,
        clientX: 10,
        clientY: 10,
        target: source,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });
    expect(state.dragRef.current).toBeNull();

    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 7,
          clientX: 40,
          clientY: 40,
          buttons: 1,
          bubbles: true,
        }),
      );
    });
    expect(result.current.dropTarget).toBe("2");
    expect(result.current.draggingGridFolderId).toBe(5);

    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: 7,
          clientX: 40,
          clientY: 40,
          bubbles: true,
        }),
      );
    });

    expect(state.onMoveFolder).toHaveBeenCalledWith(5, 2);
    expect(prepareDragPaths).not.toHaveBeenCalled();
    expect(moveFiles).not.toHaveBeenCalled();
    expect(startDrag).not.toHaveBeenCalled();
    source.remove();
    target.remove();
  });

  it("ignores an illegal grid-folder drop and one that leaves the window", () => {
    const state = bag({ folders: [folderRow(1, null), folderRow(2, 1)] });
    const { result } = renderHook(() => useFileDrag(state));

    const source = document.createElement("button");
    source.setAttribute("data-grid-folder", "1");
    document.body.appendChild(source);
    source.setPointerCapture = vi.fn();
    source.hasPointerCapture = vi.fn(() => false);
    source.releasePointerCapture = vi.fn();

    const descendant = document.createElement("div");
    descendant.setAttribute("data-folder-id", "2");
    document.body.appendChild(descendant);

    act(() => {
      result.current.onPointerDown({
        button: 0,
        pointerId: 8,
        clientX: 0,
        clientY: 0,
        target: source,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => descendant,
    });
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 8,
          clientX: 30,
          clientY: 30,
          buttons: 1,
          bubbles: true,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: 8,
          clientX: 30,
          clientY: 30,
          bubbles: true,
        }),
      );
    });
    expect(state.onMoveFolder).not.toHaveBeenCalled();

    state.onMoveFolder.mockClear();
    act(() => {
      result.current.onPointerDown({
        button: 0,
        pointerId: 9,
        clientX: 100,
        clientY: 100,
        target: source,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 9,
          clientX: -5,
          clientY: 100,
          buttons: 1,
          bubbles: true,
        }),
      );
    });
    expect(result.current.dropTarget).toBeNull();
    const legal = document.createElement("div");
    legal.setAttribute("data-folder-id", "9");
    document.body.appendChild(legal);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => legal });
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 9,
          clientX: 40,
          clientY: 40,
          buttons: 1,
          bubbles: true,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: 9,
          clientX: 40,
          clientY: 40,
          bubbles: true,
        }),
      );
    });
    expect(result.current.dropTarget).toBeNull();
    expect(state.onMoveFolder).not.toHaveBeenCalled();
    expect(startDrag).not.toHaveBeenCalled();
    expect(state.dragRef.current).toBeNull();
    source.remove();
    descendant.remove();
    legal.remove();
  });

  it("does not move on a short press, the current parent, the source, or pointercancel", () => {
    const state = bag({ folders: [folderRow(1, null), folderRow(2, 1), folderRow(5, null)], selected: [] });
    const { result } = renderHook(() => useFileDrag(state));
    const source = document.createElement("button");
    source.className = "tile folder-tile";
    source.setAttribute("data-grid-folder", "2");
    source.setAttribute("data-folder-id", "2");
    document.body.appendChild(source);
    source.setPointerCapture = vi.fn();
    source.hasPointerCapture = vi.fn(() => false);
    source.releasePointerCapture = vi.fn();

    const parent = document.createElement("div");
    parent.setAttribute("data-folder-id", "1");
    document.body.appendChild(parent);

    const down = (pointerId: number, x: number, y: number) => {
      const event = {
        button: 0,
        pointerId,
        clientX: x,
        clientY: y,
        target: source,
        preventDefault: vi.fn(),
      } as unknown as React.PointerEvent<HTMLDivElement>;
      act(() => result.current.onPointerDown(event));
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(state.dragRef.current).toBeNull();
    };

    down(11, 0, 0);
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 11, clientX: 4, clientY: 4, bubbles: true }));
    });
    expect(state.onMoveFolder).not.toHaveBeenCalled();

    down(12, 0, 0);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => parent });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 12, clientX: 30, clientY: 0, buttons: 1, bubbles: true }));
    });
    source.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    expect(startDrag).not.toHaveBeenCalled();
    expect(state.dragRef.current).toBeNull();
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 12, clientX: 30, clientY: 0, bubbles: true }));
    });
    expect(result.current.dropTarget).toBeNull();
    expect(state.onMoveFolder).not.toHaveBeenCalled();

    down(13, 0, 0);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => source });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 13, clientX: 40, clientY: 0, buttons: 1, bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 13, clientX: 40, clientY: 0, bubbles: true }));
    });
    expect(state.onMoveFolder).not.toHaveBeenCalled();

    const legal = document.createElement("div");
    legal.setAttribute("data-folder-id", "5");
    document.body.appendChild(legal);
    down(14, 0, 0);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => legal });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 14, clientX: 40, clientY: 10, buttons: 1, bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 14, clientX: 40, clientY: 10, bubbles: true }));
    });
    expect(state.onMoveFolder).not.toHaveBeenCalled();
    expect(startDrag).not.toHaveBeenCalled();
    expect(prepareDragPaths).not.toHaveBeenCalled();

    source.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
    expect(startDrag).not.toHaveBeenCalled();
    expect(state.dragRef.current).toBeNull();

    source.remove();
    parent.remove();
    legal.remove();
  });

  it("still starts a native file drag when a file tile leaves the window", async () => {
    prepareDragPaths.mockResolvedValue({ paths: ["library\\a.stl"], skipped: [], reports: [] });
    startDrag.mockImplementation(() => Promise.resolve());
    const state = bag();
    const { result } = renderHook(() => useFileDrag(state));
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.setAttribute("data-file-id", "1");
    document.body.appendChild(tile);
    tile.setPointerCapture = vi.fn();
    tile.hasPointerCapture = vi.fn(() => false);
    tile.releasePointerCapture = vi.fn();

    act(() => {
      result.current.onPointerDown({
        button: 0,
        pointerId: 4,
        clientX: 20,
        clientY: 20,
        target: tile,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });
    await waitFor(() => expect(state.dragRef.current?.pathsReady).toBe(true));
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", {
        pointerId: 4,
        clientX: -4,
        clientY: 20,
        buttons: 1,
        bubbles: true,
      }));
    });
    await waitFor(() => expect(startDrag).toHaveBeenCalled());
    expect(state.onMoveFolder).not.toHaveBeenCalled();
    tile.remove();
  });
});
