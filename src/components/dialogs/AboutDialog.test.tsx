import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { AboutDialog } from "./AboutDialog";

const libraryStats = vi.fn();

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("../../api", () => ({
  api: {
    libraryStats: (...args: unknown[]) => libraryStats(...args),
  },
}));

afterEach(() => {
  cleanup();
  libraryStats.mockReset();
});

function app(aboutOpen: boolean): LibraryModel {
  return {
    aboutOpen,
    setAboutOpen: () => undefined,
    aboutVersion: "26.10.21",
    aboutVersionFailed: false,
    setError: () => undefined,
  } as unknown as LibraryModel;
}

describe("About dialog", () => {
  it("loads catalog counts when the dialog opens", async () => {
    libraryStats.mockResolvedValue({ fileCount: 2, folderCount: 3, sizeBytes: 1_610_612_736 });
    const view = render(<AboutDialog app={app(false)} />);
    expect(libraryStats).not.toHaveBeenCalled();
    expect(screen.queryByText("Files: 2")).toBeNull();

    view.rerender(<AboutDialog app={app(true)} />);
    expect(await screen.findByText("Files: 2")).toBeTruthy();
    expect(screen.getByText("Folders: 3")).toBeTruthy();
    expect(screen.getByText("Size on disk: 1.5 GB")).toBeTruthy();
    expect(libraryStats).toHaveBeenCalledTimes(1);
  });
});
