import { useEffect, useState } from "react";
import { api } from "../api";

const POLL_MS = 2_000;

export function useThumbQueueCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let alive = true;
    const load = () => {
      void api
        .pendingThumbnailCount()
        .then((value) => {
          if (alive) setCount(value);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [enabled]);
  return count;
}
