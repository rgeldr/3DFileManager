import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FileRow } from "../types";
import { LazyThumb } from "./FileGrid";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn(),
}));

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

describe("LazyThumb", () => {
  it("shows an image when a thumbnail path is ready", () => {
    const view = render(<LazyThumb file={file({})} previewIconsEnabled scrollRoot={null} />);
    const img = view.container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toContain("abc.png");
  });

  it("shows the extension when there is no thumbnail", () => {
    const view = render(<LazyThumb file={file({ thumbPath: null, ext: "png" })} previewIconsEnabled scrollRoot={null} />);
    expect(screen.getByText("PNG")).toBeTruthy();
    expect(view.container.querySelector("img")).toBeNull();
  });
});
