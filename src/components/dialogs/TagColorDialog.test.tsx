import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { TagColorDialog } from "./TagColorDialog";

const listTagColors = vi.fn();
const setTagColor = vi.fn();

vi.mock("../../api", () => ({
  api: {
    listTagColors: (...args: unknown[]) => listTagColors(...args),
    setTagColor: (...args: unknown[]) => setTagColor(...args),
  },
}));

afterEach(() => {
  cleanup();
  listTagColors.mockReset();
  setTagColor.mockReset();
});

function app(): LibraryModel {
  return {
    tagColorOpen: true,
    setTagColorOpen: () => undefined,
    setError: () => undefined,
    refreshLists: vi.fn(async () => undefined),
  } as unknown as LibraryModel;
}

describe("Tag color dialog", () => {
  it("saves a picked color and resets to the automatic color", async () => {
    listTagColors
      .mockResolvedValueOnce([{ id: 4, name: "FDM", color: "#1f6b4a", autoColor: "#1f6b4a", custom: false }])
      .mockResolvedValueOnce([{ id: 4, name: "FDM", color: "#336699", autoColor: "#1f6b4a", custom: true }])
      .mockResolvedValueOnce([{ id: 4, name: "FDM", color: "#1f6b4a", autoColor: "#1f6b4a", custom: false }]);
    setTagColor.mockResolvedValue(undefined);
    render(<TagColorDialog app={app()} />);
    const picker = await screen.findByLabelText("Color for FDM");
    expect((picker as HTMLInputElement).value).toBe("#1f6b4a");
    expect((screen.getByRole("button", { name: "Reset FDM to its automatic color" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(picker, { target: { value: "#336699" } });
    await waitFor(() => expect(setTagColor).toHaveBeenCalledWith(4, "#336699"));
    const reset = await screen.findByRole("button", { name: "Reset FDM to its automatic color" });
    expect((reset as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(reset);
    await waitFor(() => expect(setTagColor).toHaveBeenCalledWith(4, null));
  });
});
