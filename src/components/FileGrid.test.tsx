import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { FileRow } from "../types";
import { FileGrid, LazyThumb } from "./FileGrid";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

function file(overrides: Partial<FileRow>): FileRow {
  return {
    id: 1,
    originalName: "pic.png",
    sortName: "pic",
    storedRelpath: "pic.png",
    ext: "png",
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
    absolutePath: "/library/pic.png",
    thumbPath: "/thumbs/abc.png",
    ...overrides,
  };
}

function sizeScroller(node: HTMLDivElement, scrollTop: number) {
  Object.defineProperty(node, "clientWidth", { configurable: true, get: () => 1000 });
  Object.defineProperty(node, "clientHeight", { configurable: true, get: () => 400 });
  Object.defineProperty(node, "scrollTop", { configurable: true, get: () => scrollTop });
  node.style.paddingLeft = "12px";
  node.style.paddingRight = "12px";
}

describe("LazyThumb", () => {
  it("shows an image when a thumbnail path is ready", () => {
    const view = render(<LazyThumb file={file({})} previewIconsEnabled scrollRoot={null} />);
    const img = view.container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toContain("abc.png");
    expect(img?.getAttribute("draggable")).toBe("false");
  });

  it("shows a PDF badge when the file is a document", () => {
    const view = render(
      <LazyThumb file={file({ ext: "pdf", thumbPath: null, originalName: "guide.pdf" })} previewIconsEnabled scrollRoot={null} />,
    );
    const badge = view.container.querySelector(".type-icon-pdf");
    expect(badge?.textContent).toBe("PDF");
    expect(view.container.querySelector("img")).toBeNull();
  });

  it("shows a TXT badge when the file is a text document", () => {
    const view = render(
      <LazyThumb file={file({ ext: "txt", thumbPath: null, originalName: "notes.txt" })} previewIconsEnabled scrollRoot={null} />,
    );
    const badge = view.container.querySelector(".type-icon-txt");
    expect(badge?.textContent).toBe("TXT");
    expect(view.container.querySelector("img")).toBeNull();
  });

  it("shows a bordered badge for markdown and OpenSCAD", () => {
    const md = render(
      <LazyThumb file={file({ ext: "md", thumbPath: null, originalName: "notes.md" })} previewIconsEnabled scrollRoot={null} />,
    );
    expect(md.container.querySelector(".type-icon-txt")?.textContent).toBe("MD");
    const scad = render(
      <LazyThumb file={file({ ext: "scad", thumbPath: null, originalName: "widget.scad" })} previewIconsEnabled scrollRoot={null} />,
    );
    expect(scad.container.querySelector(".type-icon-txt")?.textContent).toBe("SCAD");
  });

  it("shows the extension when there is no thumbnail", () => {
    const view = render(<LazyThumb file={file({ thumbPath: null, ext: "png" })} previewIconsEnabled scrollRoot={null} />);
    expect(screen.getByText("PNG")).toBeTruthy();
    expect(view.container.querySelector("img")).toBeNull();
  });
});

const defaultSort = { field: "name" as const, direction: "asc" as const };

function gridBase(overrides: Record<string, unknown> = {}) {
  return {
    files: [] as FileRow[],
    folders: [],
    view: "large" as const,
    sort: defaultSort,
    selected: [] as number[],
    previewIconsEnabled: false,
    scrollRootRef: { current: null as HTMLDivElement | null },
    onSelect: () => undefined,
    onSelectionChange: () => undefined,
    ...overrides,
  };
}

describe("FileGrid", () => {
  it("shows a filter message when the tag filter matches nothing", () => {
    const scroller = document.createElement("div");
    document.body.appendChild(scroller);
    const view = render(
      <FileGrid
        {...gridBase({
          emptyMessage: "No files match the selected tags",
          scrollRootRef: { current: scroller },
        })}
      />,
      { container: scroller },
    );
    expect(view.container.textContent).toContain("No files match the selected tags");
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    view.unmount();
    scroller.remove();
  });

  it("offers to clear file type and tag filters only when that action is provided", () => {
    const onClearFilters = vi.fn();
    for (const mode of ["medium", "list", "details"] as const) {
      const scroller = document.createElement("div");
      document.body.appendChild(scroller);
      const emptyView = render(
        <FileGrid
          {...gridBase({
            files: [],
            emptyMessage: "No files match the selected types",
            scrollRootRef: { current: scroller },
            view: mode,
            onClearFilters,
          })}
        />,
        { container: scroller },
      );
      expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
      expect(screen.getByText("No files match the selected types")).toBeTruthy();
      emptyView.unmount();
      scroller.remove();
    }
    const scroller = document.createElement("div");
    document.body.appendChild(scroller);
    const props = gridBase({
      files: [],
      emptyMessage: "No files match the selected types",
      scrollRootRef: { current: scroller },
      onClearFilters,
    });
    const view = render(<FileGrid {...props} />, { container: scroller });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);

    view.rerender(<FileGrid {...props} files={[file({ id: 1 })]} />);
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    view.unmount();
    scroller.remove();
  });

  it("clears type and tag state when the empty-grid button is pressed inside the marquee scroller", () => {
    const scroller = document.createElement("div");
    scroller.className = "grid-wrap";
    sizeScroller(scroller, 0);
    document.body.appendChild(scroller);
    const scrollRootRef = { current: scroller };

    function Host() {
      const [typeIds, setTypeIds] = useState(["chitubox"]);
      const [tagIds, setTagIds] = useState([7]);
      const filtering = typeIds.length > 0 || tagIds.length > 0;
      return (
        <FileGrid
          {...gridBase({
            files: [] as FileRow[],
            folders: [],
            emptyMessage: filtering
              ? "No files match the selected types"
              : "This folder is empty. Drop files here to import them.",
            scrollRootRef,
            onClearFilters: filtering
              ? () => {
                  setTypeIds([]);
                  setTagIds([]);
                }
              : undefined,
          })}
        />
      );
    }

    const view = render(<Host />, { container: scroller });
    const button = screen.getByRole("button", { name: "Clear filters" });
    const down = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      clientX: 8,
      clientY: 8,
    });
    button.dispatchEvent(down);
    // A canceled pointerdown suppresses the click, which is what the Tauri webview does.
    if (!down.defaultPrevented) fireEvent.click(button);
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(screen.getByText("This folder is empty. Drop files here to import them.")).toBeTruthy();
    view.unmount();
    scroller.remove();
  });

  it("mounts only the virtual window and keeps the full name on the tile tooltip", () => {
    const files = Array.from({ length: 100 }, (_, index) =>
      file({
        id: index + 1,
        sortName: index === 14 ? "A very long miniature name that must stay on one line" : `File ${index + 1}`,
        originalName: `file-${index + 1}.stl`,
        ext: "stl",
        thumbPath: null,
      }),
    );
    const scroller = document.createElement("div");
    sizeScroller(scroller, 184 * 3);
    document.body.appendChild(scroller);
    const ref = { current: scroller };
    const view = render(
      <FileGrid {...gridBase({ files, scrollRootRef: ref })} />,
      { container: scroller },
    );
    const tiles = view.container.querySelectorAll("[data-file-id]");
    expect(tiles[0]?.getAttribute("data-file-id")).toBe("8");
    expect(tiles[0]?.getAttribute("draggable")).toBe("false");
    expect(tiles.length).toBe(49);
    expect(tiles[0]?.getAttribute("title")).toContain("File 8");
    const named = view.container.querySelector("[data-file-id='15']");
    expect(named?.getAttribute("title")).toContain("A very long miniature name that must stay on one line");
    const grid = view.container.querySelector(".grid") as HTMLElement;
    expect(grid.style.top).toBe("184px");
    expect(grid.style.getPropertyValue("--grid-row")).toBe("172px");
    view.unmount();
    scroller.remove();
  });

  it("advances the virtual window from the grid scroller, not the page", () => {
    const files = Array.from({ length: 100 }, (_, index) =>
      file({ id: index + 1, sortName: `File ${index + 1}`, originalName: `file-${index + 1}.stl`, ext: "stl", thumbPath: null }),
    );
    const scroller = document.createElement("div");
    scroller.className = "grid-wrap";
    let scrollTop = 0;
    Object.defineProperty(scroller, "clientWidth", { configurable: true, get: () => 1000 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scroller, "scrollTop", { configurable: true, get: () => scrollTop });
    scroller.style.paddingLeft = "12px";
    scroller.style.paddingRight = "12px";
    document.body.appendChild(scroller);
    const ref = { current: scroller };
    const view = render(
      <FileGrid {...gridBase({ files, scrollRootRef: ref })} />,
      { container: scroller },
    );
    expect(view.container.querySelector("[data-file-id]")?.getAttribute("data-file-id")).toBe("1");
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(view.container.querySelector("[data-file-id]")?.getAttribute("data-file-id")).toBe("1");
    act(() => {
      scrollTop = 184 * 3;
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(view.container.querySelector("[data-file-id]")?.getAttribute("data-file-id")).toBe("8");
    expect(scroller.classList.contains("grid-wrap")).toBe(true);
    view.unmount();
    scroller.remove();
  });

  it("shows a folder icon in grid tiles with the name only below the thumb", () => {
    const scroller = document.createElement("div");
    sizeScroller(scroller, 0);
    document.body.appendChild(scroller);
    const view = render(
      <FileGrid
        {...gridBase({
          folders: [{ id: 1, name: "Bases and Toppers", parentId: null }],
          scrollRootRef: { current: scroller },
        })}
      />,
      { container: scroller },
    );
    const tile = view.container.querySelector(".folder-tile");
    expect(tile?.querySelector("svg.folder-icon")).toBeTruthy();
    expect(tile?.querySelector(".thumb")?.textContent).toBe("");
    expect(tile?.querySelector(".tile-name")?.textContent).toBe("Bases and Toppers");
    view.unmount();
    scroller.remove();
  });

  it("shows folder icon and name once in list view", () => {
    const scroller = document.createElement("div");
    sizeScroller(scroller, 0);
    document.body.appendChild(scroller);
    const view = render(
      <FileGrid
        {...gridBase({
          view: "list",
          folders: [{ id: 1, name: "Terrain", parentId: null }],
          scrollRootRef: { current: scroller },
        })}
      />,
      { container: scroller },
    );
    const row = view.container.querySelector("[data-folder-id='1']");
    expect(row?.querySelector("svg.folder-icon")).toBeTruthy();
    expect(row?.textContent).toBe("Terrain");
    view.unmount();
    scroller.remove();
  });

  it("renders five aligned columns in details header and rows", () => {
    const files = [
      file({
        id: 1,
        sortName: "Agave",
        ext: "stl",
        sizeBytes: 55_000_000,
        mtime: 1_632_153_600,
        importedAt: 1_760_000_000,
        creator: "Epic Basing",
      }),
    ];
    const scroller = document.createElement("div");
    sizeScroller(scroller, 0);
    document.body.appendChild(scroller);
    const view = render(
      <FileGrid
        {...gridBase({
          view: "details",
          files,
          scrollRootRef: { current: scroller },
        })}
      />,
      { container: scroller },
    );
    const headers = view.container.querySelectorAll(".details-header-cell");
    expect(headers).toHaveLength(5);
    expect(headers[0]?.textContent).toContain("Name");
    expect(headers[1]?.textContent).toContain("Size");
    expect(headers[2]?.textContent).toContain("Date modified");
    expect(headers[3]?.textContent).toContain("Date added");
    expect(headers[4]?.textContent).toContain("Creator");

    const row = view.container.querySelector(".details-row");
    const cells = row?.querySelectorAll(":scope > *");
    expect(cells).toHaveLength(5);
    expect(cells?.[0]?.textContent).toContain("Agave.stl");
    expect(cells?.[1]?.textContent).toMatch(/MB|KB/);
    expect(cells?.[4]?.textContent).toBe("Epic Basing");
    const template = view.container.querySelector(".details-virtual")?.getAttribute("style") ?? "";
    expect(template).toContain("240px 96px 176px 176px 128px minmax(0px, 1fr)");
    view.unmount();
    scroller.remove();
  });

  it("drags a details header border to resize that column and double-click resets it", () => {
    const scroller = document.createElement("div");
    sizeScroller(scroller, 0);
    document.body.appendChild(scroller);
    const commits: number[] = [];
    function Host() {
      const [size, setSize] = useState(96);
      return (
        <FileGrid
          {...gridBase({
            view: "details",
            files: [file({ id: 1, sortName: "Agave", ext: "stl" })],
            scrollRootRef: { current: scroller },
            detailsColumns: { name: 240, size, modified: 176, added: 176, creator: 128 },
            onDetailsColumnResize: (_id: string, width: number) => setSize(width),
            onDetailsColumnResizeEnd: (_id: string, width: number) => {
              commits.push(width);
              setSize(width);
            },
          })}
        />
      );
    }
    const view = render(<Host />, { container: scroller });
    const handle = screen.getByRole("separator", { name: "Resize Size" });
    fireEvent.pointerDown(handle, { clientX: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 30, pointerId: 1 });
    expect(handle.getAttribute("aria-valuenow")).toBe("64");
    fireEvent.pointerUp(handle, { clientX: 30, pointerId: 1 });
    expect(commits).toEqual([64]);
    fireEvent.pointerDown(handle, { clientX: 100, button: 0, pointerId: 2, detail: 2 });
    expect(commits).toEqual([64, 96]);
    expect(handle.getAttribute("aria-valuenow")).toBe("96");
    view.unmount();
    scroller.remove();
  });

  it("puts each resize handle on the right edge of its own header and drags that column", () => {
    const scroller = document.createElement("div");
    sizeScroller(scroller, 0);
    document.body.appendChild(scroller);
    const resized: { id: string; width: number }[] = [];
    function Host() {
      const [name, setName] = useState(240);
      return (
        <FileGrid
          {...gridBase({
            view: "details",
            files: [file({ id: 1, sortName: "Agave", ext: "stl" })],
            scrollRootRef: { current: scroller },
            detailsColumns: { name, size: 96, modified: 176, added: 176, creator: 128 },
            onDetailsColumnResize: (id: string, width: number) => {
              resized.push({ id, width });
              if (id === "name") setName(width);
            },
          })}
        />
      );
    }
    const view = render(<Host />, { container: scroller });
    const headers = view.container.querySelectorAll(".details-header-cell");
    const handleFor = (label: string) => screen.getByRole("separator", { name: label });
    expect(handleFor("Resize Name").parentElement).toBe(headers[0]);
    expect(handleFor("Resize Size").parentElement).toBe(headers[1]);
    expect(handleFor("Resize Date modified").parentElement).toBe(headers[2]);
    expect(handleFor("Resize Date added").parentElement).toBe(headers[3]);
    expect(handleFor("Resize Creator").parentElement).toBe(headers[4]);

    const nameHandle = handleFor("Resize Name");
    const nameCell = nameHandle.parentElement as HTMLElement;
    nameCell.getBoundingClientRect = () =>
      ({
        width: 480,
        height: 32,
        top: 0,
        left: 0,
        bottom: 32,
        right: 480,
        x: 0,
        y: 0,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    fireEvent.pointerDown(nameHandle, { clientX: 480, button: 0, pointerId: 1 });
    fireEvent.pointerMove(nameHandle, { clientX: 500, pointerId: 1 });
    expect(resized).toEqual([{ id: "name", width: 500 }]);
    expect(nameHandle.getAttribute("aria-valuenow")).toBe("500");
    view.unmount();
    scroller.remove();
  });
});
