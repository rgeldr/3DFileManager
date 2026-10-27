import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { ErrorDialog } from "./ErrorDialog";

afterEach(cleanup);

describe("ErrorDialog", () => {
  it("shows formatted errors and closes", () => {
    const setError = vi.fn();
    render(<ErrorDialog app={{ error: "boom", setError } as unknown as LibraryModel} />);
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(setError).toHaveBeenCalledWith(null);
  });
});
