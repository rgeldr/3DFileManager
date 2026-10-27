import type { LibraryModel } from "../../hooks/useLibrary";
import { createPortal } from "react-dom";
import { api } from "../../api";

export function FileContextMenu({ app }: { app: LibraryModel }) {
  const {
    fileMenu, setFileMenu, setError, selected, files, settings, setExternalProgramsOpen,
    setCreatorTarget, setCreatorValue, setFolderTagTarget, setFolderTagInput, openRenameFile, openContainingFolder,
  } = app;
  const programs = settings?.externalPrograms ?? [];
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
              <div
                className="menu-branch"
                onMouseEnter={(event) => {
                  const submenu = event.currentTarget.querySelector<HTMLElement>(".menu-submenu");
                  if (!submenu) return;
                  const right = event.currentTarget.getBoundingClientRect().right;
                  const width = submenu.offsetWidth || submenu.scrollWidth || 180;
                  submenu.classList.toggle("flip", right + width > window.innerWidth - 8);
                }}
              >
                <button type="button" role="menuitem" aria-haspopup="menu">
                  Open in…
                </button>
                <div className="menu-submenu" role="menu">
                  {programs.length === 0 ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setFileMenu(null);
                        setExternalProgramsOpen(true);
                      }}
                    >
                      Configure programs…
                    </button>
                  ) : (
                    programs.map((program) => (
                      <button
                        key={program.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          const fileId = fileMenu.fileId;
                          setFileMenu(null);
                          void api.openInProgram(fileId, program.id).catch((err) => setError(String(err)));
                        }}
                      >
                        {program.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
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
                  const fileId = fileMenu.fileId;
                  setFileMenu(null);
                  openContainingFolder(fileId);
                }}
              >
                Open containing folder
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const fileId = fileMenu.fileId;
                  setFileMenu(null);
                  openRenameFile(fileId);
                }}
              >
                Rename
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
