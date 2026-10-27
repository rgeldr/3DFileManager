import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { NamePromptDialog } from "./NamePromptDialog";

afterEach(cleanup);

describe("NamePromptDialog", () => {
  it("submits a trimmed name and closes on cancel", () => {
    const onOk = vi.fn();
    const setNamePrompt = vi.fn();
    render(
      <NamePromptDialog
        app={
          {
            namePrompt: { title: "New folder", value: "  Terrain  ", onOk },
            setNamePrompt,
          } as unknown as LibraryModel
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onOk).toHaveBeenCalledWith("Terrain");
    expect(setNamePrompt).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setNamePrompt).toHaveBeenCalledWith(null);
  });

  it("ignores blank submissions", () => {
    const onOk = vi.fn();
    const setNamePrompt = vi.fn();
    render(
      <NamePromptDialog
        app={
          {
            namePrompt: { title: "Rename", value: "   ", onOk },
            setNamePrompt,
          } as unknown as LibraryModel
        }
      />,
    );
    fireEvent.submit(screen.getByRole("button", { name: "OK" }).closest("form")!);
    expect(onOk).not.toHaveBeenCalled();
    expect(setNamePrompt).toHaveBeenCalledWith(null);
  });
});
