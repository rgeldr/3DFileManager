import { afterEach, describe, expect, it, vi } from "vitest";

const debugWrite = vi.hoisted(() => vi.fn<(line: string) => Promise<string>>(async () => "/tmp/3dfl.log"));

vi.mock("./api", () => ({
  api: {
    debugLog: (line: string) => debugWrite(line),
  },
}));

import { debugLog, flush, installDebugProbes } from "./debugLog";

function written(): string {
  return debugWrite.mock.calls.map((call) => String(call[0])).join("\n");
}

describe("installDebugProbes and flush", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    debugWrite.mockReset();
    debugWrite.mockResolvedValue("/tmp/3dfl.log");
  });

  it("logs boot and input probes, then flush writes the queue", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const listeners: { type: string; fn: EventListener }[] = [];
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
      listeners.push({ type: String(type), fn: listener as EventListener });
      add(type, listener, options);
    });
    const timer = { beat: null as (() => void) | null };
    vi.spyOn(window, "setInterval").mockImplementation((handler) => {
      if (typeof handler === "function") {
        const tick = handler as () => void;
        timer.beat = () => tick();
      }
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    installDebugProbes();
    await flush();
    await vi.waitFor(() => {
      expect(written()).toContain("boot");
      expect(written()).toContain("log-path");
    });
    expect(written()).toContain(location.href);
    expect(listeners.map((item) => item.type)).toEqual(
      expect.arrayContaining(["pointerdown", "pointerup", "keydown", "focus", "blur", "error", "unhandledrejection"]),
    );

    const button = document.createElement("button");
    button.id = "save";
    button.className = "primary icon wide extra";
    document.body.append(button);
    document.elementFromPoint = () => button;
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 12.4, clientY: 7.6, button: 0 }));
    button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
    button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("blur"));
    listeners.find((item) => item.type === "error")?.fn({
      message: "boom",
      filename: "app.tsx",
      lineno: 12,
    } as ErrorEvent);
    listeners.find((item) => item.type === "unhandledrejection")?.fn({ reason: "disk" } as PromiseRejectionEvent);
    now = 8000;
    timer.beat?.();
    await flush();
    await vi.waitFor(() => expect(written()).toContain("heartbeat-blocked"));

    const text = written();
    expect(text).toContain("pointerdown");
    expect(text).toContain("button#save.primary.icon.wide");
    expect(text).toContain('"x":12');
    expect(text).toContain('"y":8');
    expect(text).toContain("pointerup");
    expect(text).toContain('"key":"text"');
    expect(text).toContain('"key":"Enter"');
    expect(text).toContain("window-focus");
    expect(text).toContain("window-blur");
    expect(text).toContain('"message":"boom"');
    expect(text).toContain('"reason":"disk"');
    expect(text).toContain('"gapMs":7000');
    expect(text).toContain('"/tmp/3dfl.log"');
    button.remove();
  });

  it("flush puts a failed batch back and writes it on the next attempt", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    debugWrite.mockRejectedValueOnce(new Error("disk full"));
    debugLog("retry-me");
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    await flush();
    await vi.waitFor(() => expect(written()).toContain("retry-me"));
  });
});
