import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Modal } from "./Modal";

afterEach(cleanup);

describe("Modal", () => {
  it("portals its children onto the document body", () => {
    render(
      <Modal>
        <h2>Rename folder</h2>
      </Modal>,
    );
    const back = document.body.querySelector(".modal-back");
    expect(back?.querySelector("h2")?.textContent).toBe("Rename folder");
    expect(screen.getByRole("heading", { name: "Rename folder" })).toBe(back?.querySelector("h2"));
  });
});
