import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { MissingFilesDialog } from "./MissingFilesDialog";

const removeMissing = vi.fn();

vi.mock("../../api", () => ({
  api: {
    removeMissing: () => removeMissing(),
  },
}));

afterEach(() => {
  cleanup();
  removeMissing.mockReset();
});

describe("MissingFilesDialog", () => {
  it("lists missing files and removes them from the catalog", async () => {
    removeMissing.mockResolvedValue(undefined);
    const setMissingOpen = vi.fn();
    const refreshLists = vi.fn(async () => undefined);
    const reloadTree = vi.fn(async () => undefined);
    render(
      <MissingFilesDialog
        app={
          {
            missingOpen: true,
            setMissingOpen,
            missingFiles: [{ id: 1, sortName: "gone.stl" }],
            refreshLists,
            reloadTree,
          } as unknown as LibraryModel
        }
      />,
    );
    expect(screen.getByText("gone.stl")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove entries" }));
    await waitFor(() => expect(removeMissing).toHaveBeenCalled());
    expect(reloadTree).toHaveBeenCalled();
    expect(refreshLists).toHaveBeenCalled();
    expect(setMissingOpen).toHaveBeenCalledWith(false);
  });
});
