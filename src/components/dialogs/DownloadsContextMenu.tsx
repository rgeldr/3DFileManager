import { useEffect } from "react";
import type { LibraryModel } from "../../hooks/useLibrary";
import { api } from "../../api";

export function DownloadsContextMenu({
  app,
  menu,
  onClose,
}: {
  app: LibraryModel;
  menu: { x: number; y: number; path: string; selection: string[] } | null;
  onClose: () => void;
}) {
  const { setError, openAddToLibrary } = app;
  useEffect(() => {
    if (!menu) return;
    const close = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointer = (event: PointerEvent) => {
      const el = document.querySelector(".downloads-context-menu");
      if (el?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  return (
    <div
      className="file-context-menu downloads-context-menu"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          openAddToLibrary(menu.selection);
        }}
      >
        Add to library
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          void api.revealPath(menu.path).catch((err: unknown) => setError(String(err)));
        }}
      >
        Show in Explorer
      </button>
    </div>
  );
}
