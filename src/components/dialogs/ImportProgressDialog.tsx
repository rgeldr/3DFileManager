import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { api } from "../../api";
import { ImportProgressLines } from "../ImportProgress";

export function ImportProgressDialog({ app }: { app: LibraryModel }) {
  const { busy, importing, progress } = app;
  return (
    <>
      {busy || progress ? (
        <Modal>
          <div className="card">
            <h2>{busy ?? "Working"}</h2>
            <ImportProgressLines
              current={progress?.current ?? 0}
              total={progress?.total ?? 0}
              message={progress?.message ?? ""}
            />
            <div className="progress-track">
              <div
                className="progress-bar"
                style={{ width: progress && progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : "40%" }}
              />
            </div>
            {importing ? (
              <div className="row" style={{ marginTop: "1rem" }}>
                <button type="button" onClick={() => void api.cancelImport()}>
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
