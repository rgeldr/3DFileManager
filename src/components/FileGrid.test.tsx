import { render, screen } from "@testing-library/react";
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
  });

  it("shows a PDF badge when the file is a document", () => {
    const view = render(
      <LazyThumb file={file({ ext: "pdf", thumbPath: null, originalName: "guide.pdf" })} previewIconsEnabled scrollRoot={null} />,
    );
    const badge = view.container.querySelector(".type-icon-pdf");
    expect(badge?.textContent).toBe("PDF");
    expect(view.container.querySelector("img")).toBeNull();
  });

  it("shows the extension when there is no thumbnail", () => {
    const view = render(<LazyThumb file={file({ thumbPath: null, ext: "png" })} previewIconsEnabled scrollRoot={null} />);
    expect(screen.getByText("PNG")).toBeTruthy();
    expect(view.container.querySelector("img")).toBeNull();
  });
});

describe("FileGrid", () => {
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
      <FileGrid
        files={files}
        gridSize="large"
        selected={[]}
        previewIconsEnabled={false}
        scrollRootRef={ref}
        onSelect={() => undefined}
        onSelectionChange={() => undefined}
      />,
      { container: scroller },
    );
    const tiles = view.container.querySelectorAll("[data-file-id]");
    expect(tiles[0]?.getAttribute("data-file-id")).toBe("8");
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
});
