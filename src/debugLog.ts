import { api } from "./api";

const queue: string[] = [];
let flushing = false;
let announcedPath = false;

function describe(node: EventTarget | null): string {
  if (!(node instanceof Element)) return node == null ? "null" : node.constructor.name;
  const id = node.id ? `#${node.id}` : "";
  const raw = typeof node.className === "string" ? node.className : "";
  const cls = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((name) => `.${name}`)
    .join("");
  return `${node.tagName.toLowerCase()}${id}${cls}`;
}

export function debugLog(message: string, extra?: Record<string, unknown>): void {
  const detail = extra ? ` ${JSON.stringify(extra)}` : "";
  const line = `${new Date().toISOString()} ${message}${detail}`;
  console.log("[debug]", line);
  queue.push(line);
  void flush();
}

export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (queue.length > 0) {
      const batchLines = queue.splice(0, 30);
      const batch = batchLines.join("\n");
      try {
        const path = await api.debugLog(batch);
        if (!announcedPath && path) {
          announcedPath = true;
          queue.push(`${new Date().toISOString()} log-path ${JSON.stringify({ path })}`);
        }
      } catch (err) {
        console.warn("[debug] log write failed", err);
        queue.unshift(...batchLines);
        break;
      }
    }
  } finally {
    flushing = false;
    if (queue.length > 0) void flush();
  }
}

export function installDebugProbes(): void {
  debugLog("boot", {
    href: location.href,
    hasFocus: document.hasFocus(),
    theme: document.documentElement.dataset.theme ?? "",
  });

  window.addEventListener(
    "pointerdown",
    (event) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const path = event
        .composedPath()
        .slice(0, 6)
        .map((node) => describe(node));
      debugLog("pointerdown", {
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
        button: event.button,
        target: describe(event.target),
        hit: describe(hit),
        path,
      });
    },
    true,
  );

  window.addEventListener(
    "pointerup",
    (event) => {
      debugLog("pointerup", {
        target: describe(event.target),
        defaultPrevented: event.defaultPrevented,
      });
    },
    true,
  );

  window.addEventListener(
    "keydown",
    (event) => {
      const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
      debugLog("keydown", {
        key: printable ? "text" : event.key,
        target: describe(event.target),
        defaultPrevented: event.defaultPrevented,
      });
    },
    true,
  );

  window.addEventListener("focus", () => debugLog("window-focus", { hasFocus: document.hasFocus() }));
  window.addEventListener("blur", () => debugLog("window-blur"));

  window.addEventListener("error", (event) => {
    debugLog("error", { message: event.message, source: event.filename, line: event.lineno });
  });
  window.addEventListener("unhandledrejection", (event) => {
    debugLog("rejection", { reason: String(event.reason) });
  });

  let last = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    const gapMs = Math.round(now - last);
    last = now;
    debugLog(gapMs > 6000 ? "heartbeat-blocked" : "heartbeat", {
      gapMs,
      hasFocus: document.hasFocus(),
      active: describe(document.activeElement),
      modals: document.querySelectorAll(".modal-back").length,
    });
  }, 5000);
}
