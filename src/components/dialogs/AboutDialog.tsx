import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../../api";
import type { LibraryModel } from "../../hooks/useLibrary";
import type { LibraryStats } from "../../types";
import { Modal } from "./Modal";

export function formatAboutSize(bytes: number): string {
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

export function AboutDialog({
  app,
  updates,
}: {
  app: LibraryModel;
  updates: {
    busy: boolean;
    message: string | null;
    canInstall: boolean;
    onCheck: () => void;
    onInstall: () => void;
  };
}) {
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
            <h2 style={{ fontSize: 32 }}>3D File Library</h2>
            <p style={{ fontSize: 18 }}>
                Version:{" "}
                {aboutVersionFailed ? (
                  "Version unavailable"
                ) : aboutVersion ? (
                  <a
                    className="about-version"
                    href="https://github.com/rgeldr/3DFileManager/releases"
                    onClick={(e) => {
                      e.preventDefault();
                      void openUrl("https://github.com/rgeldr/3DFileManager/releases").catch((err) => setError(String(err)));
                    }}
                  >
                    {aboutVersion}
                  </a>
                ) : (
                  "…"
                )}
              </p>
            <p>Files: {stats ? stats.fileCount : "…"}</p>
            <p>Folders: {stats ? stats.folderCount : "…"}</p>
            <p>Size on disk: {stats ? formatAboutSize(stats.sizeBytes) : "…"}</p>
            {updates.message ? <p role="status">{updates.message}</p> : null}
            <div className="row">
              <button type="button" onClick={updates.onCheck} disabled={updates.busy}>
                Check for updates
              </button>
              {updates.canInstall ? (
                <button type="button" onClick={updates.onInstall} disabled={updates.busy}>
                  Install
                </button>
              ) : null}
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
