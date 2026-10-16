import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { CreatorDialog } from "./CreatorDialog";

const applyBulkMeta = vi.fn();
const setCreatorUnderFolder = vi.fn();

vi.mock("../../api", () => ({
  api: {
    applyBulkMeta: (...args: unknown[]) => applyBulkMeta(...args),
    setCreatorUnderFolder: (...args: unknown[]) => setCreatorUnderFolder(...args),
  },
}));

afterEach(() => {
  cleanup();
  applyBulkMeta.mockReset();
  setCreatorUnderFolder.mockReset();
});

function app(overrides: Record<string, unknown> = {}): LibraryModel {
  return {
    creators: ["Ada"],
    creatorTarget: { folderId: null, name: "2 selected files", fileIds: [1, 2] },
    setCreatorTarget: vi.fn(),
    creatorValue: "Ada",
    setCreatorValue: vi.fn(),
    includeSubfolders: true,
    setIncludeSubfolders: vi.fn(),
    creatorFileCount: 2,
    setError: vi.fn(),
    refreshLists: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as LibraryModel;
}

describe("Creator dialog", () => {
  it("sets the creator on the selected files only", async () => {
    applyBulkMeta.mockResolvedValue(undefined);
    const model = app();
    render(<CreatorDialog app={model} />);
    expect(screen.getByText("2 selected files")).toBeTruthy();
    expect(screen.queryByLabelText("Include subfolders")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(applyBulkMeta).toHaveBeenCalledWith([1, 2], "Ada", null);
    expect(setCreatorUnderFolder).not.toHaveBeenCalled();
    await waitFor(() => expect(model.setCreatorTarget).toHaveBeenCalledWith(null));
    expect(model.refreshLists).toHaveBeenCalled();
  });

  it("keeps the subfolder choice for folder targets", () => {
    setCreatorUnderFolder.mockResolvedValue(1);
    render(<CreatorDialog app={app({ creatorTarget: { folderId: 5, name: "Minis" } })} />);
    expect(screen.getByLabelText("Include subfolders")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(setCreatorUnderFolder).toHaveBeenCalledWith(5, "Ada", true);
    expect(applyBulkMeta).not.toHaveBeenCalled();
  });
});
