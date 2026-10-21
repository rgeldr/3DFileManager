import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileRow } from "../types";
import { ThemeProvider } from "../theme/ThemeProvider";
import { Inspector } from "./Inspector";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn(),
}));

vi.mock("../api", () => ({
  api: {
    textPreview: () => Promise.resolve(""),
    openInDefaultApp: vi.fn(),
    revealFile: vi.fn(),
  },
}));

function file(): FileRow {
  return {
    id: 3,
    originalName: "shot.png",
    sortName: "shot",
    storedRelpath: "shot.png",
    ext: "png",
    sizeBytes: 12,
    sha256: "abc",
    folderId: null,
    creator: "Ada",
    notes: "",
    sourceArchive: null,
    importedAt: 1,
    mtime: 1,
    thumbStatus: "ok",
    missing: false,
    tags: [],
    absolutePath: "/library/shot.png",
    thumbPath: null,
  };
}

function renderInspector(
  previewHeight: number,
  onPreviewHeight = vi.fn(),
  pinned = true,
  onPinnedChange = vi.fn(),
) {
  const view = render(
    <ThemeProvider>
      <Inspector
        file={file()}
        folders={[]}
        creators={[]}
        knownTags={[]}
        previewHeight={previewHeight}
        onPreviewHeight={onPreviewHeight}
        pinned={pinned}
        onPinnedChange={onPinnedChange}
        onSave={() => undefined}
        onDelete={() => undefined}
      />
    </ThemeProvider>,
  );
  const splitter = pinned ? screen.getByRole("separator", { name: "Resize preview" }) : null;
  return { ...view, splitter, onPreviewHeight, onPinnedChange };
}

afterEach(() => cleanup());

describe("inspector pin toggle", () => {
  it("shows a pressed pin control that unpins the details pane", () => {
    const onPinnedChange = vi.fn();
    renderInspector(240, vi.fn(), true, onPinnedChange);
    const pin = screen.getByRole("button", { name: "Unpin details" });
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(pin);
    expect(onPinnedChange).toHaveBeenCalledWith(false);
  });

  it("collapses to a rail with only the pin when unpinned", () => {
    const onPinnedChange = vi.fn();
    render(
      <ThemeProvider>
        <Inspector
          file={file()}
          folders={[]}
          creators={[]}
          knownTags={[]}
          previewHeight={240}
          onPreviewHeight={() => undefined}
          pinned={false}
          onPinnedChange={onPinnedChange}
          onSave={() => undefined}
          onDelete={() => undefined}
        />
      </ThemeProvider>,
    );
    const pin = screen.getByRole("button", { name: "Pin details open" });
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".inspector.collapsed")).toBeTruthy();
    expect(screen.queryByRole("separator", { name: "Resize preview" })).toBeNull();
    expect(screen.queryByLabelText("Sort name")).toBeNull();
    fireEvent.click(pin);
    expect(onPinnedChange).toHaveBeenCalledWith(true);
  });
});

describe("inspector tag save", () => {
  it("includes a typed tag when Save is clicked without pressing Enter", () => {
    const onSave = vi.fn();
    render(
      <ThemeProvider>
        <Inspector
          file={file()}
          folders={[]}
          creators={[]}
          knownTags={[]}
          previewHeight={240}
          onPreviewHeight={() => undefined}
          pinned
          onPinnedChange={() => undefined}
          onSave={onSave}
          onDelete={() => undefined}
        />
      </ThemeProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("Add a tag"), { target: { value: "terrain" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toEqual(["terrain"]);
  });

  it("keeps Enter-committed tags and flushes a pending tag on Save", () => {
    const onSave = vi.fn();
    render(
      <ThemeProvider>
        <Inspector
          file={file()}
          folders={[]}
          creators={[]}
          knownTags={[]}
          previewHeight={240}
          onPreviewHeight={() => undefined}
          pinned
          onPinnedChange={() => undefined}
          onSave={onSave}
          onDelete={() => undefined}
        />
      </ThemeProvider>,
    );
    const input = screen.getByPlaceholderText("Add a tag");
    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0][1]).toEqual(["alpha", "beta"]);
  });

  it("adds each comma-separated tag and skips duplicates", () => {
    render(
      <ThemeProvider>
        <Inspector
          file={{ ...file(), tags: ["FDM"] }}
          folders={[]}
          creators={[]}
          knownTags={["FDM", "skeleton", "resin"]}
          previewHeight={240}
          onPreviewHeight={() => undefined}
          pinned
          onPinnedChange={() => undefined}
          onSave={() => undefined}
          onDelete={() => undefined}
        />
      </ThemeProvider>,
    );
    const input = screen.getByPlaceholderText("Add a tag");
    fireEvent.change(input, { target: { value: "fdm, skeleton, , resin" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const chips = [...document.querySelectorAll(".tag")].map((chip) => chip.textContent?.replace(" ×", ""));
    expect(chips).toEqual(["FDM", "skeleton", "resin"]);
    expect(input).toHaveProperty("value", "");
  });

  it("suggests the tag after the last comma", () => {
    render(
      <ThemeProvider>
        <Inspector
          file={file()}
          folders={[]}
          creators={[]}
          knownTags={["FDM", "skeleton", "resin"]}
          previewHeight={240}
          onPreviewHeight={() => undefined}
          pinned
          onPinnedChange={() => undefined}
          onSave={() => undefined}
          onDelete={() => undefined}
        />
      </ThemeProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("Add a tag"), { target: { value: "FDM, ske" } });
    const options = document.querySelectorAll("#tags option");
    expect([...options].map((option) => option.getAttribute("value"))).toEqual(["FDM, skeleton"]);
  });

  it("applies a comma-separated tag still in the field on Save", () => {
    const onSave = vi.fn();
    render(
      <ThemeProvider>
        <Inspector
          file={file()}
          folders={[]}
          creators={[]}
          knownTags={[]}
          previewHeight={240}
          onPreviewHeight={() => undefined}
          pinned
          onPinnedChange={() => undefined}
          onSave={onSave}
          onDelete={() => undefined}
        />
      </ThemeProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("Add a tag"), { target: { value: "alpha, beta" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0][1]).toEqual(["alpha", "beta"]);
  });
});

describe("inspector preview splitter", () => {
  it("shows a focusable horizontal splitter above the scrolling details form", () => {
    const { splitter } = renderInspector(240);
    expect(splitter).toBeTruthy();
    expect(splitter!.getAttribute("aria-orientation")).toBe("horizontal");
    expect(splitter!.tabIndex).toBe(0);
    expect(splitter!.parentElement?.style.getPropertyValue("--preview-height")).toBe("240px");
    expect(splitter!.className).toContain("preview-splitter");
    const form = document.querySelector("form.inspector-body");
    expect(form?.contains(splitter!)).toBe(false);
    expect(splitter!.compareDocumentPosition(form as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText("Sort name")).toBeTruthy();
  });

  it("resizes from the keyboard and resets on double-click", () => {
    const { splitter, onPreviewHeight, rerender } = renderInspector(300);
    fireEvent.keyDown(splitter!, { key: "ArrowDown" });
    expect(onPreviewHeight).toHaveBeenCalledWith(316);
    rerender(
      <ThemeProvider>
        <Inspector
          file={file()}
          folders={[]}
          creators={[]}
          knownTags={[]}
          previewHeight={316}
          onPreviewHeight={onPreviewHeight}
          pinned
          onPinnedChange={() => undefined}
          onSave={() => undefined}
          onDelete={() => undefined}
        />
      </ThemeProvider>,
    );
    fireEvent.keyDown(splitter!, { key: "ArrowUp" });
    expect(onPreviewHeight).toHaveBeenCalledWith(300);
    fireEvent.doubleClick(splitter!);
    expect(onPreviewHeight).toHaveBeenCalledWith(240);
  });

  it("drags the preview taller inside the inspector pane", () => {
    const original = globalThis.ResizeObserver;
    class FakeObserver {
      constructor(private readonly cb: ResizeObserverCallback) {}
      observe(target: Element) {
        Object.defineProperty(target, "clientHeight", { configurable: true, value: 800 });
        this.cb([], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = FakeObserver as unknown as typeof ResizeObserver;
    try {
      const { splitter, onPreviewHeight } = renderInspector(240);
      expect(splitter!.getAttribute("aria-valuenow")).toBe("240");
      expect(splitter!.getAttribute("aria-valuemax")).toBe("646");
      fireEvent.pointerDown(splitter!, { clientY: 100, button: 0, pointerId: 1 });
      fireEvent.pointerMove(splitter!, { clientY: 180, pointerId: 1 });
      expect(splitter!.parentElement?.style.getPropertyValue("--preview-height")).toBe("320px");
      fireEvent.pointerUp(splitter!, { clientY: 180, pointerId: 1 });
      expect(onPreviewHeight).toHaveBeenCalledWith(320);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });

  it("hides the splitter until a file is selected", () => {
    render(
      <ThemeProvider>
        <Inspector
          file={null}
          folders={[]}
          creators={[]}
          knownTags={[]}
          previewHeight={240}
          onPreviewHeight={() => undefined}
          pinned
          onPinnedChange={() => undefined}
          onSave={() => undefined}
          onDelete={() => undefined}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByRole("separator", { name: "Resize preview" })).toBeNull();
  });
});

describe("inspector folder", () => {
  it("does not label an unloaded folder as Library root", () => {
    render(
      <ThemeProvider>
        <Inspector
          file={{ ...file(), folderId: 42 }}
          folders={[]}
          creators={[]}
          knownTags={[]}
          previewHeight={240}
          onPreviewHeight={() => undefined}
          pinned
          onPinnedChange={() => undefined}
          onSave={() => undefined}
          onDelete={() => undefined}
        />
      </ThemeProvider>,
    );
    const select = screen.getByLabelText("Folder") as HTMLSelectElement;
    expect(select.value).toBe("42");
    expect(select.selectedOptions[0]?.textContent).toBe("Folder not in the list");
  });

  it("shows the folder path once that folder is loaded", () => {
    render(
      <ThemeProvider>
        <Inspector
          file={{ ...file(), folderId: 42 }}
          folders={[{
            id: 42,
            parentId: 7,
            name: "Dire Wolf",
            relpath: "Toys/Articulated Toys/Flexi Animals/Dire Wolf",
            sortOrder: 0,
          }]}
          creators={[]}
          knownTags={[]}
          previewHeight={240}
          onPreviewHeight={() => undefined}
          pinned
          onPinnedChange={() => undefined}
          onSave={() => undefined}
          onDelete={() => undefined}
        />
      </ThemeProvider>,
    );
    const select = screen.getByLabelText("Folder") as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe(
      "Toys/Articulated Toys/Flexi Animals/Dire Wolf",
    );
  });
});
