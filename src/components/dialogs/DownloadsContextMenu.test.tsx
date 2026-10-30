import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadsContextMenu } from "./DownloadsContextMenu";

const revealPathMock = vi.fn(async (_path: string) => undefined);

vi.mock("../../api", () => ({
  api: {
    revealPath: (path: string) => revealPathMock(path),
  },
}));

afterEach(() => {
  cleanup();
  revealPathMock.mockClear();
});

describe("DownloadsContextMenu", () => {
  it("opens Add to library for the current selection", () => {
    const openAddToLibrary = vi.fn();
    const app = { setError: vi.fn(), openAddToLibrary } as never;
    render(
      <DownloadsContextMenu
        app={app}
        menu={{ x: 10, y: 20, path: "C:\\Users\\me\\Downloads\\part.stl", selection: ["a.stl", "b.zip"] }}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Add to library" }));
    expect(openAddToLibrary).toHaveBeenCalledWith(["a.stl", "b.zip"]);
  });

  it("reveals the right-clicked path in Explorer", () => {
    const setError = vi.fn();
    const app = { setError } as never;
    render(
      <DownloadsContextMenu
        app={app}
        menu={{ x: 10, y: 20, path: "C:\\Users\\me\\Downloads\\part.stl", selection: ["C:\\Users\\me\\Downloads\\part.stl"] }}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Show in Explorer" }));
    expect(revealPathMock).toHaveBeenCalledWith("C:\\Users\\me\\Downloads\\part.stl");
  });
});
