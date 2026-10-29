import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DETAILS_COLUMNS } from "../lib/detailsColumns";
import type { FileRow, FolderRow } from "../types";
import {
  DetailsFolderRow,
  DetailsHeader,
  DetailsRow,
  FolderIcon,
  ListRow,
  fileDisplayName,
  formatFileDate,
} from "./FileGridRows";

afterEach(cleanup);

function file(overrides: Partial<FileRow> = {}): FileRow {
  return {
    id: 9,
    originalName: "wolf.stl",
    sortName: "Wolf",
    storedRelpath: "Wolf.stl",
    ext: "stl",
    sizeBytes: 10,
    sha256: "abc",
    folderId: null,
    creator: "Ada",
    notes: "",
    sourceArchive: null,
    importedAt: 1_700_000_000,
    mtime: 1_700_000_100,
    thumbStatus: "ok",
    missing: false,
    tags: [],
    absolutePath: "/library/Wolf.stl",
    thumbPath: null,
    ...overrides,
  };
}

const folder: FolderRow = { id: 4, parentId: null, name: "Toys", relpath: "Toys", sortOrder: 0 };

describe("file row helpers", () => {
  it("fileDisplayName and formatFileDate format the grid labels", () => {
    const row = file();
    expect(fileDisplayName(row)).toBe("Wolf.stl");
    expect(formatFileDate(row.mtime)).toBe(
      new Date(row.mtime * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }),
    );
    expect(formatFileDate(row.mtime)).not.toBe(String(row.mtime));
  });

  it("FolderIcon draws the folder mark at the requested size", () => {
    const view = render(<FolderIcon size={20} className="tree" />);
    const svg = view.container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("class")).toContain("folder-icon");
    expect(svg?.getAttribute("class")).toContain("tree");
    expect(svg?.querySelector("path")?.getAttribute("d")).toContain("M10 4H4");
  });

  it("ListRow shows a folder or a file label", () => {
    const onClick = vi.fn();
    render(<ListRow label="Wolf.stl" selected isFolder={false} dataFileId={9} onClick={onClick} />);
    const fileRow = screen.getByRole("button", { name: "Wolf.stl" });
    expect(fileRow.className).toContain("selected");
    expect(fileRow.getAttribute("data-file-id")).toBe("9");
    fireEvent.click(fileRow);
    expect(onClick).toHaveBeenCalledOnce();

    render(<ListRow label="Toys" selected={false} isFolder dataFolderId={4} />);
    const folderRow = screen.getByRole("button", { name: "Toys" });
    expect(folderRow.querySelector("svg.folder-icon")).toBeTruthy();
    expect(folderRow.getAttribute("data-folder-id")).toBe("4");
  });

  it("DetailsHeader sorts the clicked column", () => {
    const onSort = vi.fn();
    render(
      <DetailsHeader
        sort={{ field: "name", direction: "asc" }}
        columns={DEFAULT_DETAILS_COLUMNS}
        onSort={onSort}
      />,
    );
    const name = screen.getByRole("button", { name: /^Name/ });
    expect(name.closest("[role=columnheader]")?.getAttribute("aria-sort")).toBe("ascending");
    expect(screen.getByRole("button", { name: "Size" }).closest("[role=columnheader]")?.getAttribute("aria-sort")).toBe("none");
    fireEvent.click(name);
    expect(onSort).toHaveBeenCalledWith("name");
    expect(screen.getByRole("separator", { name: "Resize Creator" }).getAttribute("aria-valuenow")).toBe(
      String(DEFAULT_DETAILS_COLUMNS.creator),
    );
  });

  it("DetailsRow and DetailsFolderRow show the file and folder text", () => {
    const row = file();
    const onClick = vi.fn();
    render(<DetailsRow file={row} selected onClick={onClick} />);
    const button = screen.getByRole("button", { name: /Wolf\.stl/ });
    expect(button.textContent).toContain("Wolf.stl");
    expect(button.textContent).toContain("10 B");
    expect(button.textContent).toContain(formatFileDate(row.mtime));
    expect(button.textContent).toContain(formatFileDate(row.importedAt));
    expect(button.textContent).toContain("Ada");
    expect(button.className).toContain("selected");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();

    render(<DetailsFolderRow folder={folder} />);
    const folderRow = screen.getByRole("button", { name: "Toys" });
    expect(folderRow.getAttribute("data-folder-id")).toBe("4");
    expect(folderRow.querySelector("svg.folder-icon")).toBeTruthy();
  });
});
