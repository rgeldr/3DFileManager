import { useEffect, useState } from "react";
import { api } from "../api";

export function useThumbQueueCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const load = () => void api.pendingThumbnailCount().then(setCount).catch(() => undefined);
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return count;
}
