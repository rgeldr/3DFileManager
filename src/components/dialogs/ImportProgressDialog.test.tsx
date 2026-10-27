import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { ImportProgressDialog } from "./ImportProgressDialog";

const cancelImport = vi.fn();

vi.mock("../../api", () => ({
  api: {
    cancelImport: () => cancelImport(),
  },
}));

afterEach(() => {
  cleanup();
  cancelImport.mockReset();
});

describe("ImportProgressDialog", () => {
  it("shows import progress and can cancel imports", () => {
    render(
      <ImportProgressDialog
        app={
          {
            busy: "Importing",
            importing: true,
            progress: { current: 2, total: 4, message: "Unpacking" },
          } as unknown as LibraryModel
        }
      />,
    );
    expect(screen.getByText("Importing")).toBeTruthy();
    expect(screen.getByText("Unpacking")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelImport).toHaveBeenCalled();
  });
});
