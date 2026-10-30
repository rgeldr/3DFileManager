import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
  });
});
