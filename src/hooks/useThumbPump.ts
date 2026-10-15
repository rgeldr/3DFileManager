import { useCallback, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../api";
import { debugLog } from "../debugLog";
import { MESH_BYTE_LIMIT, renderMeshStill } from "../lib/renderThumb";
import type { Settings } from "../types";

export function useThumbPump(s: {
  refreshListsRef: { current: () => Promise<void> };
  thumbGeneration: { current: number };
  ready: boolean;
  settings: Settings | null;
  dialogOpen: boolean;
  thumbNonce: number;
}) {
  const { refreshListsRef, thumbGeneration, ready, settings, dialogOpen, thumbNonce } = s;
  const pumpThumbs = useCallback(async (generation: number) => {
    const stale = () => thumbGeneration.current !== generation;
    let done = 0;
    for (;;) {
      if (stale()) return;
      await new Promise((resolve) => setTimeout(resolve, 32));
      if (stale()) return;
      const job = await api.nextThumbnail();
      if (stale()) {
        if (job?.kind === "render") await api.releaseRenderingThumb(job.id).catch(() => undefined);
        return;
      }
      if (!job) break;
      if (job.kind === "render") {
        try {
          if (job.sizeBytes > MESH_BYTE_LIMIT) {
            await api.markThumbUnavailable(job.id);
          } else {
            const png = await renderMeshStill(convertFileSrc(job.absolutePath), job.ext);
            if (stale()) {
              await api.releaseRenderingThumb(job.id);
              return;
            }
            await api.saveRenderedThumb(job.id, Array.from(png));
          }
        } catch {
          if (stale()) await api.releaseRenderingThumb(job.id).catch(() => undefined);
          else await api.markThumbUnavailable(job.id);
          if (stale()) return;
        }
      }
      if (job.kind === "done") {
        done += 1;
        if (done % 10 === 0 && !stale()) await refreshListsRef.current();
      }
    }
    if (!stale()) await refreshListsRef.current();
  }, []);
  useEffect(() => {
    if (!ready || !settings?.libraryRoot || dialogOpen) {
      debugLog("thumb-pump-idle", { ready, hasLibrary: Boolean(settings?.libraryRoot), dialogOpen });
      return;
    }
    const generation = thumbGeneration.current;
    debugLog("thumb-pump-start", { generation });
    void pumpThumbs(generation);
    return () => {
      thumbGeneration.current += 1;
      debugLog("thumb-pump-stop", { generation });
    };
  }, [ready, settings?.libraryRoot, dialogOpen, thumbNonce, pumpThumbs]);
}
