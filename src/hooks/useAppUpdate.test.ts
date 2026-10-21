import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppUpdate } from "./useAppUpdate";

const checkForAppUpdate = vi.fn();
const installPendingUpdate = vi.fn();

vi.mock("../lib/appUpdate", () => ({
  checkForAppUpdate: (...args: unknown[]) => checkForAppUpdate(...args),
  installPendingUpdate: () => installPendingUpdate(),
}));

describe("useAppUpdate", () => {
  afterEach(() => {
    checkForAppUpdate.mockReset();
    installPendingUpdate.mockReset();
  });

  it("prompts on launch when a newer version exists", async () => {
    checkForAppUpdate.mockResolvedValue({ status: "available", version: "26.10.26" });
    const { result } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(result.current.banner?.version).toBe("26.10.26"));
    expect(checkForAppUpdate).toHaveBeenCalledWith("silent");
    expect(result.current.about.canInstall).toBe(true);
    expect(result.current.about.message).toBe("Version 26.10.26 is available.");
  });

  it("stays quiet when the launch check is skipped", async () => {
    checkForAppUpdate.mockResolvedValue({ status: "skipped" });
    const { result } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(checkForAppUpdate).toHaveBeenCalledWith("silent"));
    expect(result.current.banner).toBeNull();
    expect(result.current.about.message).toBeNull();
    expect(result.current.about.canInstall).toBe(false);
  });

  it("keeps the prompt when a later manual check fails, and Later only hides the banner", async () => {
    checkForAppUpdate.mockResolvedValueOnce({ status: "available", version: "26.10.26" });
    const { result } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(result.current.banner).not.toBeNull());

    checkForAppUpdate.mockResolvedValueOnce({
      status: "error",
      message: "Could not check for updates. Check your connection and try again.",
    });
    await act(async () => {
      result.current.about.onCheck();
    });
    await waitFor(() => expect(result.current.about.message).toMatch(/connection/));
    expect(result.current.banner?.version).toBe("26.10.26");
    expect(result.current.about.canInstall).toBe(true);

    act(() => result.current.banner?.onLater());
    expect(result.current.banner).toBeNull();
    expect(result.current.about.canInstall).toBe(true);
  });

  it("clears the prompt when a manual check is up to date", async () => {
    checkForAppUpdate.mockResolvedValueOnce({ status: "available", version: "26.10.26" });
    const { result } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(result.current.banner).not.toBeNull());

    checkForAppUpdate.mockResolvedValueOnce({ status: "current" });
    await act(async () => {
      result.current.about.onCheck();
    });
    await waitFor(() => expect(result.current.about.message).toBe("You're up to date."));
    expect(result.current.banner).toBeNull();
    expect(result.current.about.canInstall).toBe(false);
  });
});
