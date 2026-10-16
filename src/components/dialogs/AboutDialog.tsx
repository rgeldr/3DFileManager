import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../../api";
import type { LibraryModel } from "../../hooks/useLibrary";
import { formatBytes } from "../../hooks/libraryTypes";
import type { LibraryStats } from "../../types";
import { Modal } from "./Modal";

function formatAboutSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function AboutDialog({ app }: { app: LibraryModel }) {
  const { aboutOpen, setAboutOpen, aboutVersion, aboutVersionFailed, setError } = app;
  const [stats, setStats] = useState<LibraryStats | null>(null);

  useEffect(() => {
    if (!aboutOpen) return;
    let cancelled = false;
    setStats(null);
    void api
      .libraryStats()
      .then((value) => {
        if (!cancelled) setStats(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [aboutOpen, setError]);

  return (
    <>
      {aboutOpen ? (
        <Modal>
          <div className="card">
            <h2>3D File Library</h2>
            <p>{aboutVersionFailed ? "Version unavailable" : aboutVersion ?? "…"}</p>
            <p>Files: {stats ? stats.fileCount : "…"}</p>
            <p>Folders: {stats ? stats.folderCount : "…"}</p>
            <p>Size on disk: {stats ? formatBytes(stats.sizeBytes) : "…"}</p>
            <div className="row">
              <button
                type="button"
                onClick={() => {
                  void openUrl("https://github.com/rgeldr/3DFileManager#readme").catch((err) => setError(String(err)));
                }}
              >
                View README on GitHub
              </button>
              <button type="button" className="primary" onClick={() => setAboutOpen(false)}>Close</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
