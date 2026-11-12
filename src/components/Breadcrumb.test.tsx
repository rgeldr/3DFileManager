import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolderRow } from "../types";
import { breadcrumbTitle, folderCrumbs, truncateCrumbs } from "../lib/breadcrumb";
import { Breadcrumb, crumbKey } from "./Breadcrumb";

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
  it("returns a single Downloads crumb", () => {
    const crumbs = folderCrumbs("Library", library, { type: "downloads" });
    expect(crumbs).toEqual([{ kind: "place", place: { type: "downloads" }, label: "Downloads" }]);
    expect(crumbKey(crumbs[0], 0)).toBe("downloads");
  });

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
    const onNavigate = vi.fn();
    render(
      <Breadcrumb
        libraryName="3D Print Library"
        folders={library}
        browse={{ type: "folder", id: 5 }}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByText("…").hasAttribute("data-folder-id")).toBe(false);
    expect(screen.getByRole("button", { name: "Wolves" }).getAttribute("data-folder-id")).toBe("4");
    expect(screen.getByRole("button", { name: "Dire Wolf" }).getAttribute("data-folder-id")).toBe("5");
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

  it("shows every ancestor when fullPath is set", () => {
    const onNavigate = vi.fn();
    render(
      <Breadcrumb
        libraryName="3D Print Library"
        folders={library}
        browse={{ type: "folder", id: 5 }}
        onNavigate={onNavigate}
        fullPath
      />,
    );
    expect(screen.queryByText("…")).toBeNull();
    expect(document.querySelector(".breadcrumb")?.getAttribute("title")).toBe(
      "3D Print Library > Toys > Articulated Toys > Flexi Animals > Wolves > Dire Wolf",
    );
    fireEvent.click(screen.getByRole("button", { name: "Articulated Toys" }));
    expect(onNavigate).toHaveBeenCalledWith({ type: "folder", id: 2 });
  });

  it("does not title a truncated breadcrumb, and breadcrumbTitle skips the ellipsis", () => {
    render(
      <Breadcrumb
        libraryName="3D Print Library"
        folders={library}
        browse={{ type: "folder", id: 5 }}
        onNavigate={() => undefined}
      />,
    );
    expect(document.querySelector(".breadcrumb")?.hasAttribute("title")).toBe(false);
    const truncated = truncateCrumbs(folderCrumbs("3D Print Library", library, { type: "folder", id: 5 }));
    expect(breadcrumbTitle(truncated)).toBe("3D Print Library > Wolves > Dire Wolf");
  });

  it("highlights a breadcrumb segment when dropTarget matches", () => {
    render(
      <Breadcrumb
        libraryName="3D Print Library"
        folders={library}
        browse={{ type: "folder", id: 3 }}
        dropTarget="2"
        onNavigate={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Articulated Toys" }).className).toContain("drop");
    expect(screen.getByRole("button", { name: "Articulated Toys" }).getAttribute("data-folder-id")).toBe("2");
    expect(screen.getByRole("button", { name: "3D Print Library" }).getAttribute("data-folder-id")).toBe("root");
    expect(screen.getByRole("button", { name: "Flexi Animals" }).className).not.toContain("drop");
  });

  it("does not mark Downloads as a folder drop target", () => {
    render(
      <Breadcrumb
        libraryName="3D Print Library"
        folders={library}
        browse={{ type: "downloads" }}
        onNavigate={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Downloads" }).hasAttribute("data-folder-id")).toBe(false);
  });

  it("crumbKey distinguishes the root, folders, and an ellipsis", () => {
    expect(crumbKey({ kind: "ellipsis" }, 2)).toBe("ellipsis-2");
    expect(crumbKey({ kind: "place", place: { type: "root" }, label: "3D Print Library" }, 0)).toBe("root");
    expect(crumbKey({ kind: "place", place: { type: "folder", id: 4 }, label: "Wolves" }, 1)).toBe("folder:4");
  });
});
