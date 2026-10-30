import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadsContextMenu } from "./DownloadsContextMenu";

const revealPath = vi.fn(async (_path: string) => undefined);

vi.mock("../../api", () => ({
  api: {
    revealPath: (path: string) => revealPath(path),
  },
}));

afterEach(() => {
  cleanup();
  revealPath.mockClear();
});

describe("DownloadsContextMenu", () => {
  it("reveals the right-clicked path in Explorer", () => {
    const setError = vi.fn();
    const app = { setError } as never;
    render(
      <DownloadsContextMenu
        app={app}
        menu={{ x: 10, y: 20, path: "C:\\Users\\me\\Downloads\\part.stl" }}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Show in Explorer" }));
    expect(revealPath).toHaveBeenCalledWith("C:\\Users\\me\\Downloads\\part.stl");
  });
});
