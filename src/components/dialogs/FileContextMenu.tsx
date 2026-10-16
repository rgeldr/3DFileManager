import type { LibraryModel } from "../../hooks/useLibrary";
import { createPortal } from "react-dom";
import { api } from "../../api";

export function FileContextMenu({ app }: { app: LibraryModel }) {
  const {
    fileMenu, setFileMenu, setError, selected, files,
    setCreatorTarget, setCreatorValue, setFolderTagTarget, setFolderTagInput,
  } = app;
  const selectionTarget = (fileId: number) => {
    const fileIds = selected.includes(fileId) ? selected : [fileId];
    const name =
      fileIds.length === 1
        ? files.find((file) => file.id === fileIds[0])?.sortName ?? "1 file"
        : `${fileIds.length} selected files`;
    return { folderId: null, name, fileIds };
  };
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
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const target = selectionTarget(fileMenu.fileId);
                  setFileMenu(null);
                  setCreatorValue("");
                  setCreatorTarget(target);
                }}
              >
                Set Creator…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const target = selectionTarget(fileMenu.fileId);
                  setFileMenu(null);
                  setFolderTagInput("");
                  setFolderTagTarget(target);
                }}
              >
                Add tags…
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
