import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { DeleteFolderDialog } from "./DeleteFolderDialog";

afterEach(cleanup);

describe("DeleteFolderDialog", () => {
  it("renders nothing without a target", () => {
    const { container } = render(
      <DeleteFolderDialog app={{ deleteConfirm: null, setDeleteConfirm: vi.fn(), performDeleteFolder: vi.fn() } as unknown as LibraryModel} />,
    );
    expect(container.textContent).toBe("");
  });

  it("cancels the pending folder delete", () => {
    const setDeleteConfirm = vi.fn();
    render(
      <DeleteFolderDialog
        app={
          {
            deleteConfirm: { id: 3, name: "Minis" },
            setDeleteConfirm,
            performDeleteFolder: vi.fn(),
          } as unknown as LibraryModel
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setDeleteConfirm).toHaveBeenCalledWith(null);
  });

  it("confirms the folder delete", () => {
    const setDeleteConfirm = vi.fn();
    const performDeleteFolder = vi.fn();
    render(
      <DeleteFolderDialog
        app={
          {
            deleteConfirm: { id: 3, name: "Minis" },
            setDeleteConfirm,
            performDeleteFolder,
          } as unknown as LibraryModel
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(performDeleteFolder).toHaveBeenCalledWith(3, "Minis");
    expect(setDeleteConfirm).toHaveBeenCalledWith(null);
  });
});
