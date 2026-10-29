import { cleanup, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileRow } from "../types";
import { ThemeProvider } from "../theme/ThemeProvider";
import {
  TextPreview,
  Viewer,
  assignSharedMaterial,
  cssVar,
  disposeMaterial,
  isMeshPreview,
  previewImage,
  releaseScene,
  staticMessage,
} from "./Viewer";

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

describe("preview helpers", () => {
  const limit = 150 * 1024 * 1024;

  it("isMeshPreview, previewImage, and staticMessage classify a file", () => {
    expect(isMeshPreview(null)).toBe(false);
    expect(isMeshPreview(file({ ext: "stl", sizeBytes: limit }))).toBe(true);
    expect(isMeshPreview(file({ ext: "stl", sizeBytes: limit + 1 }))).toBe(false);
    expect(isMeshPreview(file({ ext: "png", sizeBytes: 12 }))).toBe(false);
    expect(previewImage(file({ ext: "png", absolutePath: "/library/shot.png", thumbPath: "/thumbs/shot.png" }))).toBe(
      "asset://localhost//library/shot.png",
    );
    expect(previewImage(file({ ext: "stl", absolutePath: "/library/part.stl", thumbPath: "/thumbs/part.png" }))).toBe(
      "asset://localhost//thumbs/part.png",
    );
    expect(previewImage(file({ ext: "stl", thumbPath: null }))).toBeNull();
    expect(staticMessage(file({ ext: "pdf", thumbPath: null }))).toBe("PDF document");
    expect(staticMessage(file({ ext: "png", thumbPath: null }))).toBe("");
    expect(staticMessage(file({ ext: "step", thumbPath: null }))).toBe("Preview unavailable");
    expect(staticMessage(file({ ext: "stl", thumbPath: null }))).toBe("File is too large to preview");
  });

  it("TextPreview renders the file text", async () => {
    render(<TextPreview fileId={7} />);
    expect((await screen.findByText(/Hello/)).textContent).toBe("Hello\nworld");
  });

  it("cssVar reads a theme token and rejects a missing one", () => {
    document.documentElement.style.setProperty("--viewer-mesh", "#b0b3b6");
    expect(cssVar("--viewer-mesh")).toBe("#b0b3b6");
    expect(() => cssVar("--missing-token")).toThrow("Missing theme token --missing-token");
  });

  it("assignSharedMaterial, disposeMaterial, and releaseScene free replaced materials", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    const map = new THREE.Texture();
    const mapDispose = vi.spyOn(map, "dispose");
    const previous = new THREE.MeshStandardMaterial({ map });
    const previousDispose = vi.spyOn(previous, "dispose");
    const shared = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(geometry, previous);
    const root = new THREE.Group();
    root.add(mesh);

    assignSharedMaterial(root, shared);
    expect(mesh.material).toBe(shared);
    expect(mapDispose).toHaveBeenCalledOnce();
    expect(previousDispose).toHaveBeenCalledOnce();

    const geometryDispose = vi.spyOn(geometry, "dispose");
    const sharedDispose = vi.spyOn(shared, "dispose");
    releaseScene(root, shared);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(sharedDispose).toHaveBeenCalledOnce();
    expect(root.children).toHaveLength(0);

    const extra = new THREE.Texture();
    const extraDispose = vi.spyOn(extra, "dispose");
    const alone = new THREE.MeshStandardMaterial({ normalMap: extra });
    const aloneDispose = vi.spyOn(alone, "dispose");
    disposeMaterial(alone);
    expect(extraDispose).toHaveBeenCalledOnce();
    expect(aloneDispose).toHaveBeenCalledOnce();
  });
});
