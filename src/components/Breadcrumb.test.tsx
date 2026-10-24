import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolderRow } from "../types";
import { folderCrumbs, truncateCrumbs } from "../lib/breadcrumb";
import { Breadcrumb } from "./Breadcrumb";

afterEach(() => cleanup());

function folder(id: number, parentId: number | null, name: string): FolderRow {
  return { id, parentId, name, relpath: name, sortOrder: id };
}

const library = [
  folder(1, null, "Toys"),
  folder(2, 1, "Articulated Toys"),
  folder(3, 2, "Flexi Animals"),
  folder(4, 3, "Wolves"),
  folder(5, 4, "Dire Wolf"),
];

describe("breadcrumb", () => {
  it("shows the library and each ancestor", () => {
    const crumbs = folderCrumbs("3D Print Library", library, { type: "folder", id: 3 });
    expect(crumbs.map((crumb) => (crumb.kind === "place" ? crumb.label : "…"))).toEqual([
      "3D Print Library",
      "Toys",
      "Articulated Toys",
      "Flexi Animals",
    ]);
    expect(truncateCrumbs(crumbs).every((crumb) => crumb.kind === "place")).toBe(true);
  });

  it("collapses a long path to the root, an ellipsis, and the last two folders", () => {
    const crumbs = truncateCrumbs(folderCrumbs("3D Print Library", library, { type: "folder", id: 5 }));
    expect(crumbs.map((crumb) => (crumb.kind === "place" ? crumb.label : "…"))).toEqual([
      "3D Print Library",
      "…",
      "Wolves",
      "Dire Wolf",
    ]);
  });

  it("shows only the library when the current folder is gone", () => {
    expect(folderCrumbs("3D Print Library", library, { type: "folder", id: 99 })).toEqual([
      { kind: "place", place: { type: "root" }, label: "3D Print Library" },
    ]);
  });

  it("navigates when a segment is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <Breadcrumb
        libraryName="3D Print Library"
        folders={library}
        browse={{ type: "folder", id: 3 }}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Folder path" }).textContent).toBe(
      "3D Print Library > Toys > Articulated Toys > Flexi Animals",
    );
    fireEvent.click(screen.getByRole("button", { name: "Articulated Toys" }));
    expect(onNavigate).toHaveBeenCalledWith({ type: "folder", id: 2 });
    expect(screen.queryByRole("button", { name: "…" })).toBeNull();
  });
});
