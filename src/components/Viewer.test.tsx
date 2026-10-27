import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileRow } from "../types";
import { ThemeProvider } from "../theme/ThemeProvider";
import { Viewer } from "./Viewer";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn(),
}));

const textPreview = vi.fn((fileId: number) => Promise.resolve(fileId === 7 ? "Hello\nworld" : " \n\t "));

vi.mock("../api", () => ({
  api: {
    textPreview: (fileId: number) => textPreview(fileId),
  },
}));

afterEach(() => {
  cleanup();
  textPreview.mockReset();
  textPreview.mockImplementation((fileId: number) =>
    Promise.resolve(fileId === 7 ? "Hello\nworld" : " \n\t "),
  );
});

function file(overrides: Partial<FileRow>): FileRow {
  return {
    id: 7,
    originalName: "notes.txt",
    sortName: "notes",
    storedRelpath: "notes.txt",
    ext: "txt",
    sizeBytes: 12,
    sha256: "abc",
    folderId: null,
    creator: "",
    notes: "",
    sourceArchive: null,
    importedAt: 1,
    mtime: 1,
    thumbStatus: "unavailable",
    missing: false,
    tags: [],
    absolutePath: "/library/notes.txt",
    thumbPath: null,
    ...overrides,
  };
}

describe("Viewer text preview", () => {
  it("shows the cleaned preview in a read-only block", async () => {
    render(
      <ThemeProvider>
        <Viewer file={file({})} />
      </ThemeProvider>,
    );
    const preview = await screen.findByText(/Hello/);
    expect(preview.tagName).toBe("PRE");
    expect(preview.textContent).toBe("Hello\nworld");
    expect(preview.getAttribute("contenteditable")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not expose the preview image as a drag", () => {
    const view = render(
      <ThemeProvider>
        <Viewer file={file({ ext: "png", originalName: "shot.png", absolutePath: "/library/shot.png", thumbPath: "/thumbs/shot.png" })} />
      </ThemeProvider>,
    );
    const img = view.container.querySelector("img");
    expect(img?.getAttribute("draggable")).toBe("false");
    expect(img?.getAttribute("src")).toContain("shot.png");
    expect(img?.getAttribute("src")).not.toContain("/thumbs/");
  });

  it("shows markdown in the text preview", async () => {
    render(
      <ThemeProvider>
        <Viewer file={file({ ext: "md", originalName: "notes.md", storedRelpath: "notes.md" })} />
      </ThemeProvider>,
    );
    expect(await screen.findByText(/Hello/)).toBeTruthy();
  });

  it("does not offer a text preview for STEP files", () => {
    render(
      <ThemeProvider>
        <Viewer file={file({ ext: "step", originalName: "part.step", storedRelpath: "part.step" })} />
      </ThemeProvider>,
    );
    expect(screen.getByText("Preview unavailable")).toBeTruthy();
  });

  it("shows file info when text preview fails", async () => {
    textPreview.mockRejectedValueOnce(new Error("read failed"));
    render(
      <ThemeProvider>
        <Viewer file={file({ id: 11, originalName: "broken.txt" })} />
      </ThemeProvider>,
    );
    expect(await screen.findByText("Text file")).toBeTruthy();
  });

  it("shows file info when the preview has no printable text", async () => {
    render(
      <ThemeProvider>
        <Viewer file={file({ id: 8, originalName: "empty.txt" })} />
      </ThemeProvider>,
    );
    expect(await screen.findByText("Text file")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
