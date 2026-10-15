import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../styles");
const baseCss = readFileSync(join(stylesDir, "base.css"), "utf8");
const layoutCss = readFileSync(join(stylesDir, "layout.css"), "utf8");
const workspaceCss = readFileSync(join(stylesDir, "workspace.css"), "utf8");
const inspectorCss = readFileSync(join(stylesDir, "inspector.css"), "utf8");

function LibraryPanes() {
  return (
    <div className="app">
      <div className="app-panes">
        <aside className="sidebar">
          <div className="sidebar-head">Folders</div>
          <div className="sidebar-scroll">tree</div>
        </aside>
        <div className="pane-splitter" role="separator" aria-label="Resize folders" />
        <section className="main">
          <div className="toolbar">Search</div>
          <div className="workspace">
            <div className="grid-wrap">grid</div>
            <div className="pane-splitter" role="separator" aria-label="Resize details" />
            <aside className="inspector">
              <form className="inspector-body">details</form>
            </aside>
          </div>
          <footer className="status">status</footer>
        </section>
      </div>
    </div>
  );
}

describe("pane scroll containers", () => {
  it("keeps the folder tree, grid, and inspector on separate scrollers", () => {
    render(<LibraryPanes />);
    const folders = document.querySelector(".sidebar-scroll") as HTMLElement;
    const grid = document.querySelector(".grid-wrap") as HTMLElement;
    const details = document.querySelector(".inspector-body") as HTMLElement;
    expect(folders).toBeTruthy();
    expect(grid).toBeTruthy();
    expect(details).toBeTruthy();
    expect(new Set([folders, grid, details]).size).toBe(3);
    expect(document.scrollingElement).not.toBe(folders);
    expect(document.scrollingElement).not.toBe(grid);
    expect(document.scrollingElement).not.toBe(details);
    expect(folders.closest(".app-panes")).toBe(grid.closest(".app-panes"));
    expect(details.closest(".inspector")).not.toBe(grid);

    const heard: string[] = [];
    folders.addEventListener("scroll", () => heard.push("folders"));
    grid.addEventListener("scroll", () => heard.push("grid"));
    details.addEventListener("scroll", () => heard.push("details"));
    grid.dispatchEvent(new Event("scroll"));
    expect(heard).toEqual(["grid"]);

    expect(baseCss).toMatch(/html,\s*body,\s*#root,\s*\.app\s*\{[^}]*overflow:\s*hidden/s);
    expect(baseCss).toMatch(/height:\s*100vh/);
    expect(layoutCss).toMatch(/\.sidebar-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto/s);
    expect(workspaceCss).toMatch(/\.grid-wrap\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto/s);
    expect(inspectorCss).toMatch(/\.inspector-body\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto/s);
    expect(layoutCss).toMatch(/\.pane-splitter\s*\{[^}]*align-self:\s*stretch/s);
    expect(layoutCss.match(/\.pane-splitter\s*\{[^}]*\}/s)?.[0]).not.toMatch(/overflow:\s*auto/);
  });
});
