import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type FolderMenuState = { x: number; y: number; folderId: number | null };

export function FolderContextMenu({
  menu,
  onClose,
  onNewInFolder,
  onRenameFolder,
  onDeleteFolder,
  onTagFolder,
  onSetCreator,
  onReveal,
  onRescan,
}: {
  menu: FolderMenuState | null;
  onClose: () => void;
  onNewInFolder: (parentId: number | null) => void;
  onRenameFolder: (folderId: number) => void;
  onDeleteFolder: (folderId: number) => void;
  onTagFolder: (folderId: number | null) => void;
  onSetCreator: (folderId: number | null) => void;
  onReveal: (folderId: number | null) => void;
  onRescan: (folderId: number | null) => void;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!menu) return;
    const close = () => onCloseRef.current();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointer = (event: PointerEvent) => {
      const node = document.querySelector(".folder-context-menu");
      if (node?.contains(event.target as Node)) return;
      close();
    };
    const onScroll = () => close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu]);

  if (!menu) return null;
  const choose = (action: () => void) => {
    action();
    onClose();
  };
  return createPortal(
    <div className="folder-context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
      <button type="button" role="menuitem" onClick={() => choose(() => onNewInFolder(menu.folderId))}>
        New folder
      </button>
      {menu.folderId !== null ? (
        <>
          <button type="button" role="menuitem" onClick={() => choose(() => onRenameFolder(menu.folderId!))}>
            Rename
          </button>
          <button type="button" role="menuitem" onClick={() => choose(() => onDeleteFolder(menu.folderId!))}>
            Delete
          </button>
        </>
      ) : null}
      <button type="button" role="menuitem" onClick={() => choose(() => onTagFolder(menu.folderId))}>
        Tag contents…
      </button>
      <button type="button" role="menuitem" onClick={() => choose(() => onSetCreator(menu.folderId))}>
        Set Creator…
      </button>
      <button type="button" role="menuitem" onClick={() => choose(() => onReveal(menu.folderId))}>
        Show in Explorer
      </button>
      <button type="button" role="menuitem" onClick={() => choose(() => onRescan(menu.folderId))}>
        Rescan
      </button>
    </div>,
    document.body,
  );
}
