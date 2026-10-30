import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadsPanel, nextDownloadSort, pickDownloadsFolder } from "./DownloadsPanel";
import type { DownloadRow } from "../types";

const open = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => open(...args),
}));

afterEach(() => {
  cleanup();
  open.mockReset();
});

const row: DownloadRow = {
  name: "boat.stl",
  relativeDir: "prints",
  ext: "stl",
  sizeBytes: 4,
  mtime: 10,
  absolutePath: "C:\\Users\\me\\Downloads\\prints\\boat.stl",
};

describe("DownloadsPanel", () => {
  it("offers Set Downloads folder when unset and Clear when the folder is missing or empty", () => {
    const onSetFolder = vi.fn();
    const onClearFolder = vi.fn();
    const { rerender } = render(
      <DownloadsPanel
        list={{ status: "unset" }}
        sort={{ field: "path", direction: "asc" }}
        onSort={() => undefined}
        selected={[]}
        onSelectionChange={() => undefined}
        onContextMenu={() => undefined}
        onSetFolder={onSetFolder}
        onClearFolder={onClearFolder}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Set Downloads folder…" }));
    expect(onSetFolder).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Clear saved path" })).toBeNull();

    rerender(
      <DownloadsPanel
        list={{ status: "missing" }}
        sort={{ field: "path", direction: "asc" }}
        onSort={() => undefined}
        selected={[]}
        onSelectionChange={() => undefined}
        onContextMenu={() => undefined}
        onSetFolder={onSetFolder}
        onClearFolder={onClearFolder}
      />,
    );
    expect(screen.getByText(/missing/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear saved path" }));
    expect(onClearFolder).toHaveBeenCalled();

    rerender(
      <DownloadsPanel
        list={{ status: "ok", rows: [], truncated: false }}
        sort={{ field: "path", direction: "asc" }}
        onSort={() => undefined}
        selected={[]}
        onSelectionChange={() => undefined}
        onContextMenu={() => undefined}
        onSetFolder={onSetFolder}
        onClearFolder={onClearFolder}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear saved path" }));
    expect(onClearFolder).toHaveBeenCalledTimes(2);
  });

  it("shows the path column for a listed file", () => {
    render(
      <DownloadsPanel
        list={{ status: "ok", rows: [row], truncated: false }}
        sort={{ field: "path", direction: "asc" }}
        onSort={() => undefined}
        selected={[]}
        onSelectionChange={() => undefined}
        onContextMenu={() => undefined}
        onSetFolder={() => undefined}
        onClearFolder={() => undefined}
      />,
    );
    expect(screen.getByText("prints")).toBeTruthy();
    expect(screen.getByText("boat.stl")).toBeTruthy();
  });
});

describe("nextDownloadSort", () => {
  it("starts name and path ascending and flips the active column", () => {
    expect(nextDownloadSort({ field: "path", direction: "asc" }, "name")).toEqual({ field: "name", direction: "asc" });
    expect(nextDownloadSort({ field: "name", direction: "asc" }, "size")).toEqual({ field: "size", direction: "desc" });
    expect(nextDownloadSort({ field: "size", direction: "desc" }, "size")).toEqual({ field: "size", direction: "asc" });
  });
});

describe("pickDownloadsFolder", () => {
  it("returns the chosen directory and ignores a cancelled picker", async () => {
    open.mockResolvedValueOnce("C:\\Users\\me\\Downloads");
    expect(await pickDownloadsFolder()).toBe("C:\\Users\\me\\Downloads");
    open.mockResolvedValueOnce(null);
    expect(await pickDownloadsFolder()).toBeNull();
  });
});
