import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { formatErrorForDisplay } from "../../hooks/libraryTypes";

export function ErrorDialog({ app }: { app: LibraryModel }) {
  const { error, setError } = app;
  return (
    <>
      {error ? (
        <Modal>
          <div className="card">
            <h2>Something went wrong</h2>
            <p className="card-scroll">{formatErrorForDisplay(error)}</p>
            <div className="row">
              <button type="button" className="primary" onClick={() => setError(null)}>Close</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
