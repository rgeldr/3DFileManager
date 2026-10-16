import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

vi.mock("../debugLog", () => ({
  debugLog: vi.fn(),
}));

import { debugLog } from "../debugLog";

function Boom({ crash }: { crash: boolean }) {
  if (crash) throw new Error("filter exploded");
  return <p>ready</p>;
}

afterEach(() => cleanup());

describe("AppErrorBoundary", () => {
  it("logs the component stack and recovers without leaving a blank page", () => {
    const { rerender } = render(
      <AppErrorBoundary>
        <Boom crash />
      </AppErrorBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Something went wrong.");
    expect(alert.textContent).toContain("filter exploded");
    expect(debugLog).toHaveBeenCalledWith(
      "react-error",
      expect.objectContaining({
        message: "filter exploded",
        componentStack: expect.stringContaining("Boom"),
      }),
    );

    rerender(
      <AppErrorBoundary>
        <Boom crash={false} />
      </AppErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("ready")).toBeTruthy();
  });

  it("closes a popover boundary instead of unmounting the app", () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <AppErrorBoundary title="The tag filter could not open." onReset={onReset}>
        <Boom crash />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain("The tag filter could not open.");
    rerender(
      <AppErrorBoundary title="The tag filter could not open." onReset={onReset}>
        <Boom crash={false} />
      </AppErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.getByText("ready")).toBeTruthy();
  });
});
