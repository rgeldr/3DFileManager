import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { DragFailureDialog } from "./DragFailureDialog";

const openInDefaultApp = vi.fn();
const revealFile = vi.fn();

vi.mock("../../api", () => ({
  api: {
    openInDefaultApp: (...args: unknown[]) => openInDefaultApp(...args),
    revealFile: (...args: unknown[]) => revealFile(...args),
  },
}));

afterEach(() => {
  cleanup();
  openInDefaultApp.mockReset();
  revealFile.mockReset();
});

describe("DragFailureDialog", () => {
  it("offers open, reveal, and close actions", () => {
    openInDefaultApp.mockResolvedValue(undefined);
    revealFile.mockResolvedValue(undefined);
    const setDragFailure = vi.fn();
    render(
      <DragFailureDialog
        app={
          {
            dragFailure: { fileId: 8, message: "blocked" },
            setDragFailure,
            setError: vi.fn(),
          } as unknown as LibraryModel
        }
      />,
    );
    expect(screen.getByText("blocked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Show in Explorer" }));
    expect(openInDefaultApp).toHaveBeenCalledWith(8);
    expect(revealFile).toHaveBeenCalledWith(8);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(setDragFailure).toHaveBeenCalledWith(null);
  });
});
