import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function updates(overrides: Partial<{
  busy: boolean;
  message: string | null;
  canInstall: boolean;
  onCheck: () => void;
  onInstall: () => void;
}> = {}) {
  return {
    busy: false,
    message: null,
    canInstall: false,
    onCheck: () => undefined,
    onInstall: () => undefined,
    ...overrides,
  };
}

describe("About dialog", () => {
  it("loads catalog counts when the dialog opens", async () => {
    libraryStats.mockResolvedValue({ fileCount: 2, folderCount: 3, sizeBytes: 13_314_398_618 });
    const view = render(<AboutDialog app={app(false)} updates={updates()} />);
    expect(libraryStats).not.toHaveBeenCalled();
    expect(screen.queryByText("Files: 2")).toBeNull();

    view.rerender(<AboutDialog app={app(true)} updates={updates()} />);
    expect(await screen.findByText("Files: 2")).toBeTruthy();
    expect(screen.getByText("Folders: 3")).toBeTruthy();
    expect(screen.getByText("Size on disk: 12.4 GB")).toBeTruthy();
    expect(libraryStats).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("offers install when a newer version is available and shows check results", () => {
    libraryStats.mockResolvedValue({ fileCount: 0, folderCount: 0, sizeBytes: 0 });
    const onCheck = vi.fn();
    const onInstall = vi.fn();
    const view = render(
      <AboutDialog
        app={app(true)}
        updates={updates({
          message: "Version 26.10.26 is available.",
          canInstall: true,
          onCheck,
          onInstall,
        })}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Version 26.10.26 is available.");
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(onInstall).toHaveBeenCalledOnce();

    view.rerender(
      <AboutDialog app={app(true)} updates={updates({ message: "You're up to date.", onCheck, onInstall })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(onCheck).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe("You're up to date.");
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });
});
