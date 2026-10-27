import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { debugLog } from "../debugLog";
import { clampInspector, clampSidebar } from "../lib/paneWidths";
import { clampDetailsColumns } from "../lib/detailsColumns";
import { persistPreviewHeight } from "../lib/previewSplit";
import type { LibrarySort, Settings } from "../types";
import { fallbackDragIconPath, type Actions, type DiskProgress } from "./libraryTypes";

export function useSessionEffects(s: {
  dialogOpen: boolean;
  busy: string | null;
  progress: { current: number; total: number; message: string } | null;
  summary: { importedCount: number } | null;
  namePrompt: { title: string } | null;
  deleteConfirm: { name: string } | null;
  missingOpen: boolean;
  error: string | null;
  ready: boolean;
  settings: Settings | null;
  setSettings: React.Dispatch<React.SetStateAction<Settings | null>>;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  setInspectorWidth: React.Dispatch<React.SetStateAction<number>>;
  setInspectorPinned: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarPinned: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewHeight: (height: number) => void;
  setDetailsColumns: (columns: import("../types").DetailsColumns) => void;
  setFolders: React.Dispatch<React.SetStateAction<import("../types").FolderRow[]>>;
  setMissingCount: React.Dispatch<React.SetStateAction<number>>;
  setTheme: (theme: "dark" | "light") => void;
  refreshLists: (
    nextBrowse?: import("../types").Browse,
    nextQuery?: string,
    nextCreator?: string,
    nextSort?: LibrarySort,
    mode?: "passive",
  ) => Promise<void>;
  setReady: (ready: boolean) => void;
  setError: (message: string | null) => void;
  dragIconRef: { current: string | null };
  runImportRef: { current: (paths: string[]) => Promise<void> };
  setProgress: (progress: { current: number; total: number; message: string } | null) => void;
  setThumbNonce: React.Dispatch<React.SetStateAction<number>>;
  browse: import("../types").Browse;
  query: string;
  creator: string;
  selectedTagIds: number[];
  selectedTypeIds: string[];
  tagMatch: "any" | "all";
  sort: LibrarySort;
  setPreviewIconsEnabled: (enabled: boolean) => void;
  aboutOpen: boolean;
  setAboutVersion: (version: string | null) => void;
  setAboutVersionFailed: (failed: boolean) => void;
  creatorTarget: { folderId: number | null; name: string; fileIds?: number[] } | null;
  setCreatorFileCount: (count: number | null) => void;
  includeSubfolders: boolean;
  fileMenu: { x: number; y: number; fileId: number } | null;
  setFileMenu: (menu: { x: number; y: number; fileId: number } | null) => void;
  folderTagTarget: { folderId: number | null; name: string; fileIds?: number[] } | null;
  setFolderTagFileCount: (count: number | null) => void;
  diskProgress: { current: DiskProgress };
  setDiskDialog: React.Dispatch<React.SetStateAction<import("./libraryTypes").DiskDialog | null>>;
  toastTimer: { current: number | null };
  actions: { current: Actions };
  runDiskOp: (opts: {
    title: string;
    cancellable: boolean;
    success: string;
    cancelled: string;
    run: () => Promise<{ cancelled: boolean }>;
    after?: () => Promise<void> | void;
    tree?: boolean;
  }) => Promise<void>;
  runImport: (paths: string[]) => Promise<void>;
  setAboutOpen: (open: boolean) => void;
  setTagColorOpen: (open: boolean) => void;
  setExternalProgramsOpen: (open: boolean) => void;
}) {
  const {
    dialogOpen,
    ready, settings, setSettings, setSidebarWidth, setInspectorWidth, setInspectorPinned, setSidebarPinned, setPreviewHeight, setDetailsColumns, setFolders, setMissingCount,
    setTheme, refreshLists, setReady, setError, dragIconRef, runImportRef, setProgress, setThumbNonce,
    browse, query, creator, selectedTagIds, selectedTypeIds, tagMatch, sort, setPreviewIconsEnabled, aboutOpen, setAboutVersion,
    setAboutVersionFailed, creatorTarget, setCreatorFileCount, includeSubfolders, fileMenu, setFileMenu,
    folderTagTarget, setFolderTagFileCount, diskProgress, setDiskDialog, toastTimer, actions, runDiskOp,
    runImport, setAboutOpen, setTagColorOpen, setExternalProgramsOpen,
  } = s;
  useEffect(() => {
    if (!dialogOpen) return;
    const focusDialog = () => {
      document.querySelector<HTMLElement>(".modal-back input, .modal-back button")?.focus();
    };
    try {
      void getCurrentWebview().setFocus().then(focusDialog).catch(focusDialog);
    } catch {
      focusDialog();
    }
  }, [dialogOpen]);

  useEffect(() => {
    actions.current = {
      importFolder: () => {
        void open({ directory: true, multiple: false }).then((path) => {
          if (typeof path === "string") void runImport([path]);
        });
      },
      importArchive: () => {
        void open({
          multiple: true,
          filters: [{ name: "Archives", extensions: ["zip", "rar", "7z"] }],
        }).then((path) => {
          if (typeof path === "string") void runImport([path]);
          else if (Array.isArray(path)) void runImport(path);
        });
      },
      moveLibrary: () => {
        void open({ directory: true, multiple: false }).then((path) => {
          if (typeof path !== "string") return;
          void runDiskOp({
            title: "Moving library...",
            cancellable: true,
            success: "Library moved",
            cancelled: "Library move cancelled",
            run: () => api.moveLibraryRoot(path),
            after: async () => {
              await refreshLists();
              setThumbNonce((nonce) => nonce + 1);
            },
            tree: true,
          });
        });
      },
      backupLibrary: () => {
        void open({ directory: true, multiple: false }).then((path) => {
          if (typeof path !== "string") return;
          void runDiskOp({
            title: "Backing up library...",
            cancellable: true,
            success: "Library backup saved",
            cancelled: "Library backup cancelled",
            run: () => api.exportLibraryBackup(path),
          });
        });
      },
      restoreLibrary: (libraryPath) => {
        void open({ directory: true, multiple: false }).then((backupPath) => {
          if (typeof backupPath !== "string") return;
          const runRestore = (dest: string) => {
            void runDiskOp({
              title: "Importing backup...",
              cancellable: true,
              success: "Library imported from backup",
              cancelled: "Backup import cancelled",
              run: () => api.restoreLibraryBackup(backupPath, dest),
              after: async () => {
                await refreshLists();
                setThumbNonce((nonce) => nonce + 1);
              },
              tree: true,
            });
          };
          if (typeof libraryPath === "string" && libraryPath.length > 0) {
            runRestore(libraryPath);
            return;
          }
          void open({ directory: true, multiple: false }).then((dest) => {
            if (typeof dest === "string") runRestore(dest);
          });
        });
      },
      rescan: () => {
        void runDiskOp({
          title: "Rescanning library...",
          cancellable: true,
          success: "Rescan finished",
          cancelled: "Rescan cancelled",
          run: () => api.rescanLibrary(),
          after: async () => {
            await refreshLists();
            setThumbNonce((nonce) => nonce + 1);
          },
          tree: true,
        });
      },
      clearThumbs: () => {
        void api.clearThumbnailCache().then(() => setThumbNonce((nonce) => nonce + 1)).catch((err) => setError(String(err)));
      },
      setTheme: (next) => {
        setTheme(next);
        void api.setTheme(next);
      },
      setGrid: (size) => {
        setSettings((current) => (current ? { ...current, gridSize: size } : current));
        void api.setGridSize(size);
      },
      showAbout: () => {
        setAboutVersion(null);
        setAboutVersionFailed(false);
        setAboutOpen(true);
      },
      openTagColors: () => setTagColorOpen(true),
      openExternalPrograms: () => setExternalProgramsOpen(true),
    };
  }, [refreshLists, runDiskOp, runImport, setTheme]);

  useEffect(() => {
    return () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<DiskProgress>("disk-progress", (event) => {
      diskProgress.current = event.payload;
      setDiskDialog((current) =>
        current
          ? {
              ...current,
              ...event.payload,
              title: current.title,
              cancellable: current.cancellable && event.payload.cancellable,
            }
          : current,
      );
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    let unlisten = () => undefined;
    void api.bootstrap().then(async (boot) => {
      setSettings(boot.settings);
      setSidebarWidth(clampSidebar(boot.settings.sidebarWidth, window.innerWidth));
      setInspectorWidth(clampInspector(boot.settings.inspectorWidth, window.innerWidth));
      setInspectorPinned(boot.settings.inspectorPinned !== false);
      setSidebarPinned(boot.settings.sidebarPinned !== false);
      setPreviewHeight(persistPreviewHeight(boot.settings.previewHeight, 0));
      setDetailsColumns(clampDetailsColumns(boot.settings.detailsColumns));
      setFolders(boot.folders);
      setMissingCount(boot.missingCount);
      if (boot.settings.theme === "light" || boot.settings.theme === "dark") {
        setTheme(boot.settings.theme);
      }
      if (boot.settings.libraryRoot) {
        await refreshLists();
      }
      setReady(true);
    }).catch((err) => {
      setError(String(err));
      setReady(true);
    });
    void fallbackDragIconPath().then((path) => {
      dragIconRef.current = path;
    }).catch((err: unknown) => {
      debugLog("drag-icon", { error: String(err) });
    });
    const drag = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        void runImportRef.current(event.payload.paths);
      }
    });
    const progressUnlisten = listen<{ current: number; total: number; message: string }>("import-progress", (event) => {
      setProgress(event.payload);
    });
    const hashUnlisten = listen("hash-pass-complete", () => {
      void refreshLists().then(() => setThumbNonce((nonce) => nonce + 1));
    });
    void Promise.all([drag, progressUnlisten, hashUnlisten]).then(([a, b, c]) => {
      unlisten = () => {
        a();
        b();
        c();
      };
    });
    return () => unlisten();
    // Bootstrap and OS drop handling run once. Later imports go through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void refreshLists(browse, query, creator, sort, "passive").catch((err) => setError(String(err)));
    }, 200);
    return () => clearTimeout(timer);
  }, [browse, query, creator, selectedTagIds, selectedTypeIds, tagMatch, sort, settings?.searchScope, ready, refreshLists]);

  useEffect(() => {
    if (!ready || !settings?.libraryRoot) return;
    const timer = setTimeout(() => setPreviewIconsEnabled(true), 5000);
    return () => clearTimeout(timer);
  }, [ready, settings?.libraryRoot]);

  useEffect(() => {
    const onResize = () => {
      setSidebarWidth((current) => clampSidebar(current, window.innerWidth));
      setInspectorWidth((current) => clampInspector(current, window.innerWidth));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!aboutOpen) return;
    let cancelled = false;
    void getVersion()
      .then((version) => {
        if (!cancelled) setAboutVersion(version);
      })
      .catch(() => {
        if (!cancelled) setAboutVersionFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [aboutOpen]);

  useEffect(() => {
    if (!creatorTarget) {
      setCreatorFileCount(null);
      return;
    }
    if (creatorTarget.fileIds) {
      setCreatorFileCount(creatorTarget.fileIds.length);
      return;
    }
    void api
      .countFilesForScope(creatorTarget.folderId, includeSubfolders)
      .then(setCreatorFileCount)
      .catch((err) => setError(String(err)));
  }, [creatorTarget, includeSubfolders]);

  useEffect(() => {
    if (!fileMenu) return;
    const close = () => setFileMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointer = (event: PointerEvent) => {
      const menu = document.querySelector(".file-context-menu");
      if (menu?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [fileMenu]);

  useEffect(() => {
    if (!folderTagTarget) {
      setFolderTagFileCount(null);
      return;
    }
    if (folderTagTarget.fileIds) {
      setFolderTagFileCount(folderTagTarget.fileIds.length);
      return;
    }
    void api
      .addTagsUnderFolder(folderTagTarget.folderId, [])
      .then(setFolderTagFileCount)
      .catch((err) => setError(String(err)));
  }, [folderTagTarget]);
}
