import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { openUrl } from "@tauri-apps/plugin-opener";

export function AboutDialog({ app }: { app: LibraryModel }) {
  const { aboutOpen, setAboutOpen, aboutVersion, aboutVersionFailed, setError } = app;
  return (
    <>
      {aboutOpen ? (
        <Modal>
          <div className="card">
            <h2>3D File Library</h2>
            <p>{aboutVersionFailed ? "Version unavailable" : aboutVersion ?? "…"}</p>
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
