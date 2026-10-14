import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImportProgressLines } from "./ImportProgress";

describe("ImportProgressLines", () => {
  it("puts a fixed counter above a single-line file name", () => {
    const view = render(
      <ImportProgressLines current={5075} total={8202} message="A very long miniature file name.stl" />,
    );
    const count = view.container.querySelector(".progress-count");
    const name = view.container.querySelector(".progress-name");
    expect(count?.textContent).toBe("5075 of 8202");
    expect(name?.textContent).toBe("A very long miniature file name.stl");
    expect(name?.getAttribute("title")).toBe("A very long miniature file name.stl");
    expect(count && name && count.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/5075 of 8202 ·/)).toBeNull();
  });
});
