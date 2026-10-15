import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TagChips, TagFilter } from "../components/TagFilter";
import type { TagCount } from "../types";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../styles");
const workspaceCss = readFileSync(join(stylesDir, "workspace.css"), "utf8");
const chipCss = readFileSync(join(stylesDir, "tag-filter.css"), "utf8");

const tags: TagCount[] = [
  { id: 1, name: "Humans", fileCount: 4 },
  { id: 2, name: "Elves", fileCount: 2 },
];

function Toolbar({ selected }: { selected: number[] }) {
  return (
    <div className="toolbar">
      <div className="toolbar-search">
        <input type="search" aria-label="Search" />
        <TagChips tags={tags} selectedIds={selected} onSelectedIds={() => undefined} />
      </div>
      <div className="toolbar-controls">
        <div className="toolbar-row">
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
    expect(controls.contains(tagsButton)).toBe(true);
    expect(controls.contains(screen.getByLabelText("Creator"))).toBe(true);
    expect(controls.contains(screen.getByLabelText("Sort"))).toBe(true);
    expect(creatorRow).toBe(screen.getByLabelText("Sort").parentElement);
    expect(creatorRow?.className).toBe("toolbar-row");
    expect(document.querySelector(".tag-filter-chips")).toBeNull();

    view.rerender(<Toolbar selected={[1, 2]} />);
    const chips = document.querySelector(".tag-filter-chips") as HTMLElement;
    const search = document.querySelector(".toolbar-search") as HTMLElement;
    expect(search.contains(chips)).toBe(true);
    expect(controls.contains(chips)).toBe(false);
    expect(search.children[0]?.tagName).toBe("INPUT");
    expect(search.children[1]).toBe(chips);
    expect(screen.getByLabelText("Creator").parentElement).toBe(creatorRow);
    expect(screen.getByRole("button", { name: "Tags (2)" }).parentElement?.closest(".toolbar-controls")).toBe(controls);
    expect(chips.textContent).toContain("Humans");
    expect(chips.textContent).toContain("Elves");

    expect(workspaceCss).toMatch(/\.toolbar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/s);
    expect(workspaceCss).toMatch(/\.toolbar-controls\s*\{[^}]*flex-direction:\s*column/s);
    expect(workspaceCss).toMatch(/\.toolbar-row\s*\{[^}]*flex-wrap:\s*nowrap/s);
    expect(chipCss).not.toMatch(/flex:\s*1\s*0\s*100%/);
    expect(chipCss).toMatch(/\.tag-filter-chips\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*auto/s);
  });
});
