import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateBanner } from "./UpdateBanner";

afterEach(cleanup);

describe("UpdateBanner", () => {
  it("shows the default message and handles install actions", () => {
    const onInstall = vi.fn();
    const onLater = vi.fn();
    render(
      <UpdateBanner version="2.0.0" message={null} busy={false} onInstall={onInstall} onLater={onLater} />,
    );
    expect(screen.getByText("Version 2.0.0 is available.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(onInstall).toHaveBeenCalled();
    expect(onLater).toHaveBeenCalled();
  });

  it("shows a custom message and disables buttons while busy", () => {
    render(
      <UpdateBanner version="2.0.0" message="Downloading update" busy onInstall={() => undefined} onLater={() => undefined} />,
    );
    expect(screen.getByText("Downloading update")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Install" })).toHaveProperty("disabled", true);
  });
});
