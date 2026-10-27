import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { DiskProgressDialog } from "./DiskProgressDialog";

const cancelDiskOp = vi.fn();

vi.mock("../../api", () => ({
  api: {
    cancelDiskOp: () => cancelDiskOp(),
  },
}));

afterEach(() => {
  cleanup();
  cancelDiskOp.mockReset();
});

describe("DiskProgressDialog", () => {
  it("shows progress details and can cancel when allowed", () => {
    render(
      <DiskProgressDialog
        app={
          {
            diskDialog: {
              title: "Moving files",
              current: 2,
              total: 5,
              name: "part.stl",
              bytesDone: 1024,
              bytesTotal: 2048,
              cancellable: true,
            },
          } as unknown as LibraryModel
        }
      />,
    );
    expect(screen.getByText("Moving files")).toBeTruthy();
    expect(screen.getByText(/2 of 5/)).toBeTruthy();
    expect(screen.getByText(/1.0 KB of 2.0 KB/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelDiskOp).toHaveBeenCalled();
  });

  it("hides cancel when the operation is not cancellable", () => {
    render(
      <DiskProgressDialog
        app={
          {
            diskDialog: {
              title: "Working",
              current: 0,
              total: 0,
              name: "",
              bytesDone: 0,
              bytesTotal: 0,
              cancellable: false,
            },
          } as unknown as LibraryModel
        }
      />,
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
