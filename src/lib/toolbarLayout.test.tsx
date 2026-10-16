import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LibrarySearch } from "../components/LibrarySearch";
import { TagFilter } from "../components/TagFilter";
import { TypeFilter } from "../components/TypeFilter";
import type { TagCount, TypeCount } from "../types";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../styles");
const workspaceCss = readFileSync(join(stylesDir, "workspace.css"), "utf8");
const chipCss = readFileSync(join(stylesDir, "tag-filter.css"), "utf8");

const tags: TagCount[] = [
  { id: 1, name: "Humans", fileCount: 4 },
  { id: 2, name: "Elves", fileCount: 2 },
];

const types: TypeCount[] = [
  { id: "stl", label: "stl", exts: ["stl"], fileCount: 3 },
  { id: "jpg", label: "jpg / jpeg", exts: ["jpg", "jpeg"], fileCount: 1 },
];

function Toolbar({ selected, selectedTypes = [] }: { selected: number[]; selectedTypes?: string[] }) {
  return (
    <div className="toolbar">
      <LibrarySearch
        query={selected.length > 0 ? "lion" : ""}
        creator=""
        selectedTagIds={selected}
        selectedTypeIds={selectedTypes}
        tags={tags}
        types={types}
        onQuery={() => undefined}
        onClear={() => undefined}
        onSelectedTagIds={() => undefined}
        onSelectedTypeIds={() => undefined}
      />
      <div className="toolbar-controls">
        <div className="toolbar-row">
          <TypeFilter types={types} selectedIds={selectedTypes} onSelectedIds={() => undefined} />
          <TagFilter
            tags={tags}
            selectedIds={selected}
            match="any"
            onSelectedIds={() => undefined}
            onMatch={() => undefined}
          />
        </div>
        <div className="toolbar-row">
          <select aria-label="Creator" defaultValue="">
            <option value="">All creators</option>
          </select>
          <select aria-label="Sort" defaultValue="name">
            <option value="name">Sort name</option>
          </select>
        </div>
      </div>
    </div>
  );
}

describe("toolbar layout", () => {
  it("keeps the tag button, creator, and sort in place when chips appear under search", () => {
    const view = render(<Toolbar selected={[]} />);
    const controls = document.querySelector(".toolbar-controls") as HTMLElement;
    const creatorRow = screen.getByLabelText("Creator").parentElement;
    const tagsButton = screen.getByRole("button", { name: "Tags" });
    const typesButton = screen.getByRole("button", { name: "File Types" });
    const clearButton = screen.getByRole("button", { name: "Clear filters" });
    const search = document.querySelector(".toolbar-search") as HTMLElement;
    expect(clearButton.closest(".toolbar-search-row")).toBe(screen.getByLabelText("Search").parentElement);
    expect(search.contains(clearButton)).toBe(true);
    expect(controls.contains(clearButton)).toBe(false);
    expect((clearButton as HTMLButtonElement).disabled).toBe(true);
    expect(typesButton.closest(".toolbar-row")).toBe(tagsButton.closest(".toolbar-row"));
    expect(typesButton.compareDocumentPosition(tagsButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(controls.contains(tagsButton)).toBe(true);
    expect(controls.contains(screen.getByLabelText("Creator"))).toBe(true);
    expect(controls.contains(screen.getByLabelText("Sort"))).toBe(true);
    expect(creatorRow).toBe(screen.getByLabelText("Sort").parentElement);
    expect(creatorRow?.className).toBe("toolbar-row");
    expect(document.querySelector(".tag-filter-chips")).toBeNull();

    view.rerender(<Toolbar selected={[1, 2]} selectedTypes={["stl"]} />);
    const chips = document.querySelector(".tag-filter-chips") as HTMLElement;
    expect(search.contains(chips)).toBe(true);
    expect(controls.contains(chips)).toBe(false);
    expect(search.children[0]?.className).toBe("toolbar-search-row");
    expect(search.children[0]?.children[0]?.tagName).toBe("INPUT");
    expect(search.children[0]?.children[1]).toBe(screen.getByRole("button", { name: "Clear filters" }));
    expect((screen.getByRole("button", { name: "Clear filters" }) as HTMLButtonElement).disabled).toBe(false);
    expect(search.children[1]).toBe(chips);
    expect(screen.getByLabelText("Creator").parentElement).toBe(creatorRow);
    expect(screen.getByRole("button", { name: "Tags (2)" }).parentElement?.closest(".toolbar-controls")).toBe(controls);
    expect(screen.getByRole("button", { name: "File Types (1)" }).closest(".toolbar-row")).toBe(tagsButton.closest(".toolbar-row"));
    expect(chips.textContent).toContain("Humans");
    expect(chips.textContent).toContain("Elves");
    expect(chips.querySelector(".type-chip")?.textContent).toContain("stl");
    expect(chips.querySelectorAll(".tag-filter-chips").length).toBe(0);

    expect(workspaceCss).toMatch(/\.toolbar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/s);
    expect(workspaceCss).toMatch(/\.toolbar-controls\s*\{[^}]*flex-direction:\s*column/s);
    expect(workspaceCss).toMatch(/\.toolbar-row\s*\{[^}]*flex-wrap:\s*nowrap/s);
    expect(chipCss).not.toMatch(/flex:\s*1\s*0\s*100%/);
    expect(chipCss).toMatch(/\.tag-filter-chips\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*auto/s);
  });
});
