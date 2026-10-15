import type { LibraryModel } from "../../hooks/useLibrary";
import { createPortal } from "react-dom";
import { api } from "../../api";

export function FileContextMenu({ app }: { app: LibraryModel }) {
  const { fileMenu, setFileMenu, setError } = app;
  return (
    <>
      {fileMenu
        ? createPortal(
            <div className="file-context-menu" style={{ left: fileMenu.x, top: fileMenu.y }} role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const fileId = fileMenu.fileId;
                  setFileMenu(null);
                  void api.openInDefaultApp(fileId).catch((err) => setError(String(err)));
                }}
              >
                Open
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const fileId = fileMenu.fileId;
                  setFileMenu(null);
                  void api.revealFile(fileId).catch((err) => setError(String(err)));
                }}
              >
                Show in Explorer
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
