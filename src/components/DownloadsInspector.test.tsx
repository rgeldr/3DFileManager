import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadsInspector } from "./DownloadsInspector";
import type { DownloadRow } from "../types";

afterEach(() => cleanup());

const row: DownloadRow = {
  name: "boat.stl",
  relativeDir: "prints\\boats",
  ext: "stl",
  sizeBytes: 12,
  mtime: 1_700_000_000,
  absolutePath: "C:\\Users\\me\\Downloads\\prints\\boats\\boat.stl",
};

describe("DownloadsInspector", () => {
  it("shows read-only path details and no editors", () => {
    render(<DownloadsInspector row={row} pinned onPinnedChange={() => undefined} />);
    expect(screen.getByText("boat.stl")).toBeTruthy();
    expect(screen.getByText("prints\\boats")).toBeTruthy();
    expect(screen.getByText(row.absolutePath)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByRole("complementary").className).toBe("inspector");
  });

  it("collapses to the same pin rail as the library inspector", () => {
    render(<DownloadsInspector row={row} pinned={false} onPinnedChange={() => undefined} />);
    const pane = screen.getByRole("complementary");
    expect(pane.className).toContain("collapsed");
    expect(pane.getAttribute("data-pinned")).toBe("false");
    expect(screen.getByRole("button", { name: "Pin details open" })).toBeTruthy();
    expect(screen.queryByText(row.absolutePath)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Details" })).toBeNull();
  });

  it("toggles pin state and shows the empty selection message", () => {
    const onPinnedChange = vi.fn();
    const { rerender } = render(<DownloadsInspector row={null} pinned onPinnedChange={onPinnedChange} />);
    expect(screen.getByText("Select a downloaded file to see its details.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unpin details" }));
    expect(onPinnedChange).toHaveBeenCalledWith(false);
    rerender(<DownloadsInspector row={{ ...row, relativeDir: "" }} pinned onPinnedChange={onPinnedChange} />);
    expect(screen.getByText("(Downloads root)")).toBeTruthy();
  });
});
