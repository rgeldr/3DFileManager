import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { Toast } from "./Toast";

afterEach(cleanup);

describe("Toast", () => {
  it("renders a status message when present", () => {
    const { container, rerender } = render(
      <Toast app={{ toast: null } as unknown as LibraryModel} />,
    );
    expect(container.textContent).toBe("");
    rerender(<Toast app={{ toast: "Saved" } as unknown as LibraryModel} />);
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });
});
