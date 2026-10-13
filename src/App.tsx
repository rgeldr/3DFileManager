import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Menu, MenuItem, PredefinedMenuItem, Submenu, CheckMenuItem } from "@tauri-apps/api/menu";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { api } from "./api";
import { FileGrid } from "./components/FileGrid";
import { Inspector } from "./components/Inspector";
import { Sidebar } from "./components/Sidebar";
import { debugLog } from "./debugLog";
import { renderMeshStill } from "./lib/renderThumb";
import { useTheme } from "./theme/ThemeProvider";
import type { Browse, FileRow, FolderRow, GridSize, ImportSummary, Settings } from "./types";

function Modal({ children }: { children: ReactNode }) {
  return createPortal(<div className="modal-back">{children}</div>, document.body);
}

const ERROR_MESSAGE_MAX = 2000;

let fallbackDragIcon: Promise<string> | null = null;

function fallbackDragIconPath(): Promise<string> {
  if (!fallbackDragIcon) {
    fallbackDragIcon = api.dragIconPath().catch((err: unknown) => {
      fallbackDragIcon = null;
      throw err;
    });
  }
  return fallbackDragIcon;
}

function formatErrorForDisplay(message: string): string {
  if (message.length <= ERROR_MESSAGE_MAX) return message;
  return `${message.slice(0, ERROR_MESSAGE_MAX)}\n…(truncated)`;
}

interface Actions {
  importFolder: () => void;
  importArchive: () => void;
  rescan: () => void;
  clearThumbs: () => void;
  setTheme: (theme: "dark" | "light") => void;
  setGrid: (size: GridSize) => void;
}

export function App() {
  const { theme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [browse, setBrowse] = useState<Browse>({ type: "root" });
  const [query, setQuery] = useState("");
  const [creator, setCreator] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("name");
  const [creators, setCreators] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [missingCount, setMissingCount] = useState(0);
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingFiles, setMissingFiles] = useState<FileRow[]>([]);
  const [chosenRoot, setChosenRoot] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [bulk, setBulk] = useState<number[] | null>(null);
  const [bulkCreator, setBulkCreator] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [folderTagTarget, setFolderTagTarget] = useState<{ folderId: number | null; name: string } | null>(null);
  const [folderTagInput, setFolderTagInput] = useState("");
  const [folderTagFileCount, setFolderTagFileCount] = useState<number | null>(null);
  const [namePrompt, setNamePrompt] = useState<null | { title: string; value: string; onOk: (value: string) => void }>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<null | { id: number; name: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragRef = useRef<{ ids: number[]; active: boolean; startedNative: boolean } | null>(null);
  const actions = useRef<Actions>({
    importFolder: () => undefined,
    importArchive: () => undefined,
    rescan: () => undefined,
    clearThumbs: () => undefined,
    setTheme: () => undefined,
    setGrid: () => undefined,
  });
  const themeItems = useRef<{ dark?: CheckMenuItem; light?: CheckMenuItem }>({});
  const gridItems = useRef<Partial<Record<GridSize, CheckMenuItem>>>({});
  const [thumbNonce, setThumbNonce] = useState(0);
  const thumbGeneration = useRef(0);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [previewIconsEnabled, setPreviewIconsEnabled] = useState(false);
  const [folderExpandHint, setFolderExpandHint] = useState<{ key: string; nonce: number } | null>(null);

  const libraryName = useMemo(() => {
    const root = settings?.libraryRoot;
    if (!root) return "Library";
    const parts = root.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || "Library";
  }, [settings]);

  const targetFolderId = browse.type === "folder" ? browse.id : null;

  const refreshLists = useCallback(async (nextBrowse = browse, nextQuery = query, nextCreator = creator, nextTag = tag, nextSort = sort) => {
    const queryActive = /[\p{L}\p{N}]/u.test(nextQuery);
    const finding = queryActive || nextCreator !== "" || nextTag !== "";
    const folder = finding ? "all" : nextBrowse.type === "root" ? "root" : "id";
    const folderId = !finding && nextBrowse.type === "folder" ? nextBrowse.id : null;
    const [rows, creatorRows, tagRows, boot] = await Promise.all([
      api.listFiles({ folder, folderId, query: nextQuery, creator: nextCreator, tag: nextTag, sort: nextSort }),
      api.listCreators(),
      api.listTags(),
      api.bootstrap(),
    ]);
    setFiles(rows);
    setCreators(creatorRows);
    setTags(tagRows);
    setFolders(boot.folders);
    setMissingCount(boot.missingCount);
    setSettings(boot.settings);
  }, [browse, creator, query, sort, tag]);

  const openNewFolderPrompt = useCallback((parentId: number | null) => {
    setNamePrompt({
      title: "New folder",
      value: "",
      onOk: (value) => {
        const expandKey = parentId == null ? "root" : `folder:${parentId}`;
        void api.createFolder(parentId, value)
          .then(() => {
            setFolderExpandHint((hint) => ({ key: expandKey, nonce: (hint?.nonce ?? 0) + 1 }));
            return refreshLists();
          })
          .catch((err) => setError(String(err)));
      },
    });
  }, [refreshLists]);

  const openRenameFolderPrompt = useCallback((folderId: number) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    setNamePrompt({
      title: "Rename folder",
      value: folder.name,
      onOk: (value) => {
        void api.renameFolder(folder.id, value).then(() => refreshLists()).catch((err) => setError(String(err)));
      },
    });
  }, [folders, refreshLists]);

  const openDeleteFolderConfirm = useCallback((folderId: number) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    setDeleteConfirm({ id: folderId, name: folder.name });
  }, [folders]);

  const performDeleteFolder = useCallback((folderId: number) => {
    void api.deleteFolder(folderId)
      .then(() => {
        setBrowse({ type: "root" });
        return refreshLists({ type: "root" });
      })
      .catch((err) => setError(String(err)));
  }, [refreshLists]);

  const runImportRef = useRef<(paths: string[]) => Promise<void>>(async () => undefined);

  const pumpThumbs = useCallback(async (generation: number) => {
    const stale = () => thumbGeneration.current !== generation;
    for (let i = 0; i < 5000; i += 1) {
      if (stale()) return;
      await new Promise((resolve) => setTimeout(resolve, 32));
      if (stale()) return;
      const job = await api.nextThumbnail();
      if (!job) break;
      if (job.kind === "render") {
        try {
          const png = await renderMeshStill(convertFileSrc(job.absolutePath), job.ext);
          if (stale()) return;
          await api.saveRenderedThumb(job.id, Array.from(png));
        } catch {
          await api.markThumbUnavailable(job.id);
        }
      }
    }
    if (!stale()) await refreshLists();
  }, [refreshLists]);

  const BULK_TAG_LIMIT = 200;

  const runImport = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    setBusy("Importing…");
    setImporting(true);
    setProgress({ current: 0, total: 0, message: "Counting files…" });
    try {
      const result = await api.importPaths(paths, targetFolderId);
      setSummary(result);
      if (result.importedIds.length === 1) setSelected(result.importedIds);
      if (result.importedIds.length > 1 && result.importedIds.length <= BULK_TAG_LIMIT) {
        setBulk(result.importedIds);
      }
      await refreshLists();
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
      setBusy(null);
      setProgress(null);
    }
  }, [refreshLists, targetFolderId]);
  runImportRef.current = runImport;

  const dialogOpen = Boolean(busy || progress || summary || bulk || namePrompt || deleteConfirm || missingOpen || error);

  useEffect(() => {
    debugLog("dialogs", {
      busy,
      progress: progress ? `${progress.current}/${progress.total} ${progress.message}` : null,
      summary: summary ? summary.importedCount : null,
      bulk: bulk?.length ?? null,
      namePrompt: namePrompt?.title ?? null,
      deleteConfirm: deleteConfirm?.name ?? null,
      missingOpen,
      error,
    });
  }, [busy, progress, summary, bulk, namePrompt, deleteConfirm, missingOpen, error]);

  useEffect(() => {
    if (!ready || !settings?.libraryRoot || dialogOpen) {
      debugLog("thumb-pump-idle", { ready, hasLibrary: Boolean(settings?.libraryRoot), dialogOpen });
      return;
    }
    const generation = thumbGeneration.current;
    debugLog("thumb-pump-start", { generation });
    void pumpThumbs(generation);
    return () => {
      thumbGeneration.current += 1;
      debugLog("thumb-pump-stop", { generation });
    };
  }, [ready, settings?.libraryRoot, dialogOpen, thumbNonce, pumpThumbs]);

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
      rescan: () => {
        setBusy("Rescanning library…");
        void api.rescanLibrary()
          .then(async () => {
            await refreshLists();
            setThumbNonce((nonce) => nonce + 1);
          })
          .catch((err) => setError(String(err)))
          .finally(() => setBusy(null));
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
    };
  }, [refreshLists, runImport, setTheme]);

  useEffect(() => {
    let unlisten = () => undefined;
    void api.bootstrap().then(async (boot) => {
      setSettings(boot.settings);
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
    void fallbackDragIconPath().catch((err: unknown) => {
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
      void refreshLists().catch((err) => setError(String(err)));
    }, 200);
    return () => clearTimeout(timer);
  }, [browse, query, creator, tag, sort, ready, refreshLists]);

  useEffect(() => {
    if (!ready || !settings?.libraryRoot) return;
    const timer = setTimeout(() => setPreviewIconsEnabled(true), 5000);
    return () => clearTimeout(timer);
  }, [ready, settings?.libraryRoot]);

  useEffect(() => {
    if (!folderTagTarget) {
      setFolderTagFileCount(null);
      return;
    }
    void api
      .addTagsUnderFolder(folderTagTarget.folderId, [])
      .then(setFolderTagFileCount)
      .catch((err) => setError(String(err)));
  }, [folderTagTarget]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const dark = await CheckMenuItem.new({
        id: "theme-dark",
        text: "Dark",
        checked: theme === "dark",
        action: () => actions.current.setTheme("dark"),
      });
      const light = await CheckMenuItem.new({
        id: "theme-light",
        text: "Light",
        checked: theme === "light",
        action: () => actions.current.setTheme("light"),
      });
      const medium = await CheckMenuItem.new({
        id: "grid-medium",
        text: "Medium",
        checked: settings?.gridSize === "medium",
        action: () => actions.current.setGrid("medium"),
      });
      const large = await CheckMenuItem.new({
        id: "grid-large",
        text: "Large",
        checked: settings?.gridSize === "large",
        action: () => actions.current.setGrid("large"),
      });
      const extra = await CheckMenuItem.new({
        id: "grid-extra",
        text: "Extra large",
        checked: settings?.gridSize === "extraLarge",
        action: () => actions.current.setGrid("extraLarge"),
      });
      themeItems.current = { dark, light };
      gridItems.current = { medium, large, extraLarge: extra };
      const menu = await Menu.new({
        items: [
          await Submenu.new({
            text: "File",
            items: [
              await MenuItem.new({ text: "Import folder...", action: () => actions.current.importFolder() }),
              await MenuItem.new({ text: "Import archive...", action: () => actions.current.importArchive() }),
              await PredefinedMenuItem.new({ item: "Separator" }),
              await MenuItem.new({ text: "Rescan library", action: () => actions.current.rescan() }),
              await MenuItem.new({ text: "Clear thumbnail cache", action: () => actions.current.clearThumbs() }),
              await PredefinedMenuItem.new({ item: "Separator" }),
              await PredefinedMenuItem.new({ item: "Quit" }),
            ],
          }),
          await Submenu.new({
            text: "View",
            items: [
              medium,
              large,
              extra,
              await PredefinedMenuItem.new({ item: "Separator" }),
              await Submenu.new({ text: "Theme", items: [dark, light] }),
            ],
          }),
        ],
      });
      if (!cancelled) await menu.setAsAppMenu();
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    void themeItems.current.dark?.setChecked(theme === "dark");
    void themeItems.current.light?.setChecked(theme === "light");
  }, [theme]);

  useEffect(() => {
    const size = settings?.gridSize ?? "large";
    void gridItems.current.medium?.setChecked(size === "medium");
    void gridItems.current.large?.setChecked(size === "large");
    void gridItems.current.extraLarge?.setChecked(size === "extraLarge");
  }, [settings?.gridSize]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      drag.active = true;
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const folder = element?.closest("[data-folder-id]")?.getAttribute("data-folder-id") ?? null;
      setDropTarget(folder);
      const outside = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth - 1 || event.clientY >= window.innerHeight - 1;
      if (outside && !drag.startedNative) {
        drag.startedNative = true;
        const paths = files.filter((file) => drag.ids.includes(file.id)).map((file) => file.absolutePath);
        const thumb = files.find((file) => drag.ids.includes(file.id) && file.thumbPath)?.thumbPath;
        if (paths.length > 0) {
          void (async () => {
            try {
              const icon = thumb ?? (await fallbackDragIconPath());
              await startDrag({ item: paths, icon });
            } catch (err) {
              setError(String(err));
            }
          })();
        }
      }
    };
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag?.active || drag.startedNative) {
        setDropTarget(null);
        return;
      }
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const folder = element?.closest("[data-folder-id]")?.getAttribute("data-folder-id");
      setDropTarget(null);
      if (!folder) return;
      const folderId = folder === "root" ? null : Number(folder);
      void api.moveFiles(drag.ids, folderId).then(() => refreshLists()).catch((err) => setError(String(err)));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [files, refreshLists]);

  const browseKey = browse.type === "folder" ? `folder:${browse.id}` : browse.type;

  const selectedFile = files.find((file) => selected.length === 1 && file.id === selected[0]) ?? null;

  const onSelect = (id: number, mode: "replace" | "toggle" | "range") => {
    if (mode === "toggle") {
      setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
      return;
    }
    if (mode === "range" && selected.length > 0) {
      const ids = files.map((file) => file.id);
      const start = ids.indexOf(selected[selected.length - 1]);
      const end = ids.indexOf(id);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        setSelected(ids.slice(from, to + 1));
        return;
      }
    }
    setSelected([id]);
    dragRef.current = { ids: [id], active: false, startedNative: false };
  };

  if (!ready || !settings) {
    return <div className="setup"><p>Loading…</p></div>;
  }

  if (!settings.libraryRoot) {
    return (
      <div className="setup">
        <div className="card">
          <h1>3D File Library</h1>
          <p>Choose where this app should store its library copies.</p>
          <p className="muted">{chosenRoot ?? "No folder selected"}</p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                void open({ directory: true, multiple: false }).then((path) => {
                  if (typeof path === "string") setChosenRoot(path);
                });
              }}
            >
              Choose folder
            </button>
            <button
              type="button"
              className="primary"
              disabled={!chosenRoot}
              onClick={() => {
                if (!chosenRoot) return;
                void api.setLibraryRoot(chosenRoot).then(async (boot) => {
                  setSettings(boot.settings);
                  setFolders(boot.folders);
                  setMissingCount(boot.missingCount);
                  await refreshLists();
                }).catch((err) => setError(String(err)));
              }}
            >
              Continue
            </button>
          </div>
          {error ? <p>{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="app"
      onPointerDown={(event) => {
        const tile = (event.target as HTMLElement).closest("[data-file-id]");
        if (!tile || event.button !== 0) return;
        const id = Number(tile.getAttribute("data-file-id"));
        const ids = selected.includes(id) ? selected : [id];
        dragRef.current = { ids, active: false, startedNative: false };
      }}
    >
      <Sidebar
        folders={folders}
        libraryName={libraryName}
        browseKey={browseKey}
        dropTarget={dropTarget}
        expandHint={folderExpandHint}
        onBrowse={(key) => {
          if (key === "root") setBrowse({ type: "root" });
          else setBrowse({ type: "folder", id: Number(key.slice(7)) });
          setSelected([]);
        }}
        onNew={() => openNewFolderPrompt(browse.type === "folder" ? browse.id : null)}
        onRename={() => {
          if (browse.type !== "folder") return;
          openRenameFolderPrompt(browse.id);
        }}
        onDelete={() => {
          if (browse.type !== "folder") return;
          openDeleteFolderConfirm(browse.id);
        }}
        onNewInFolder={openNewFolderPrompt}
        onRenameFolder={openRenameFolderPrompt}
        onDeleteFolder={openDeleteFolderConfirm}
        onTagFolder={(folderId) => {
          const name =
            folderId === null
              ? libraryName
              : folders.find((item) => item.id === folderId)?.name ?? "Folder";
          setFolderTagInput("");
          setFolderTagTarget({ folderId, name });
        }}
        onMoveFolder={(id, parentId) => {
          const expandKey = parentId == null ? "root" : `folder:${parentId}`;
          void api.moveFolder(id, parentId)
            .then(() => {
              setFolderExpandHint((hint) => ({ key: expandKey, nonce: (hint?.nonce ?? 0) + 1 }));
              return refreshLists();
            })
            .catch((err) => setError(String(err)));
        }}
      />
      <section className="main">
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select value={creator} onChange={(event) => setCreator(event.target.value)}>
            <option value="">All creators</option>
            {creators.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="">All tags</option>
            {tags.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="name">Sort name</option>
            <option value="creator">Creator</option>
            <option value="date">Date added</option>
          </select>
        </div>
        {missingCount > 0 ? (
          <div className="banner">
            <span>{missingCount} catalog entries are missing from disk.</span>
            <button
              type="button"
              onClick={() => {
                void api.missingFiles().then((rows) => {
                  setMissingFiles(rows);
                  setMissingOpen(true);
                });
              }}
            >
              Review
            </button>
          </div>
        ) : null}
        <div className="workspace">
          <div className="grid-wrap" ref={gridScrollRef}>
            <FileGrid
              files={files}
              gridSize={settings.gridSize}
              selected={selected}
              previewIconsEnabled={previewIconsEnabled}
              scrollRootRef={gridScrollRef}
              onSelect={onSelect}
            />
          </div>
          <Inspector
            file={selectedFile}
            folders={folders}
            creators={creators}
            knownTags={tags}
            onSave={(file, nextTags) => {
              void api.updateFile({
                id: file.id,
                sortName: file.sortName,
                creator: file.creator,
                notes: file.notes,
                folderId: file.folderId,
              }).then(() => api.setTags(file.id, nextTags)).then(() => refreshLists()).catch((err) => setError(String(err)));
            }}
            onDelete={(id) => {
              void api.deleteFiles([id]).then(() => {
                setSelected([]);
                return refreshLists();
              }).catch((err) => setError(String(err)));
            }}
          />
        </div>
        <footer className="status">
          <span>{files.length === 1 ? "1 file" : `${files.length} files`}{selected.length ? ` · ${selected.length} selected` : ""}</span>
          <div className="view-toggle">
            {(["medium", "large", "extraLarge"] as GridSize[]).map((size) => (
              <button
                key={size}
                type="button"
                className={settings.gridSize === size ? "active" : ""}
                onClick={() => actions.current.setGrid(size)}
              >
                {size === "extraLarge" ? "Extra large" : size[0].toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>
        </footer>
      </section>
      {busy || progress ? (
        <Modal>
          <div className="card">
            <h2>{busy ?? "Working"}</h2>
            <p>
              {progress?.message}
              {progress && progress.total > 0 ? ` · ${progress.current} of ${progress.total}` : null}
            </p>
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
      {summary && !bulk ? (
        <Modal>
          <div className="card">
            <h2>{summary.cancelled ? "Import stopped" : "Import finished"}</h2>
            <p>
              Imported {summary.importedCount}. Duplicates skipped {summary.duplicateCount}. Unsupported {summary.unsupportedCount}.
            </p>
            {summary.pendingHashCount > 0 ? (
              <p>Duplicate checking continues in the background for {summary.pendingHashCount} files.</p>
            ) : null}
            {summary.failed.length > 0 ? <p>{summary.failed.slice(0, 5).join(" ")}</p> : null}
            {summary.recycleCount > 0 ? (
              <p>Keep the originals, or move them to the Recycle Bin?</p>
            ) : null}
            <div className="row">
              <button type="button" className="primary" onClick={() => setSummary(null)}>Keep originals</button>
              {summary.recycleCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    void api.recycleLastImport().then((failed) => {
                      if (failed.length) setError(failed.join("\n"));
                      setSummary(null);
                    });
                  }}
                >
                  Move to Recycle Bin
                </button>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}
      {folderTagTarget ? (
        <Modal>
          <div className="card">
            <h2>Tag folder contents</h2>
            <p>
              Add tags to every file in <strong>{folderTagTarget.name}</strong> and its subfolders.
              Tags already on those files are kept.
            </p>
            {folderTagFileCount === 0 ? <p className="muted">This folder has no files.</p> : null}
            {folderTagFileCount != null && folderTagFileCount > 0 ? (
              <p className="muted">{folderTagFileCount} files will be updated.</p>
            ) : null}
            <input
              placeholder="Tags, separated by commas"
              value={folderTagInput}
              list="folder-tag-suggestions"
              autoFocus
              disabled={folderTagFileCount === 0}
              onChange={(event) => setFolderTagInput(event.target.value)}
            />
            <datalist id="folder-tag-suggestions">
              {tags.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
            <div className="row">
              <button type="button" onClick={() => setFolderTagTarget(null)}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={folderTagFileCount === 0}
                onClick={() => {
                  const nextTags = folderTagInput
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);
                  if (!nextTags.length) {
                    setFolderTagTarget(null);
                    return;
                  }
                  void api
                    .addTagsUnderFolder(folderTagTarget.folderId, nextTags)
                    .then(() => refreshLists())
                    .catch((err) => setError(String(err)))
                    .finally(() => setFolderTagTarget(null));
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {bulk ? (
        <Modal>
          <div className="card">
            <h2>Tag this import</h2>
            <p>Apply a creator and tags to the {bulk.length} files just imported.</p>
            <input placeholder="Creator" value={bulkCreator} autoFocus onChange={(event) => setBulkCreator(event.target.value)} />
            <input placeholder="Tags, separated by commas" value={bulkTags} onChange={(event) => setBulkTags(event.target.value)} />
            <div className="row">
              <button type="button" onClick={() => setBulk(null)}>Skip</button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const nextTags = bulkTags.split(",").map((item) => item.trim()).filter(Boolean);
                  void api.applyBulkMeta(bulk, bulkCreator.trim() || null, nextTags.length ? nextTags : null)
                    .then(() => refreshLists())
                    .finally(() => setBulk(null));
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {namePrompt ? (
        <Modal>
          <form
            className="card"
            onSubmit={(event) => {
              event.preventDefault();
              const value = namePrompt.value.trim();
              if (value) namePrompt.onOk(value);
              setNamePrompt(null);
            }}
          >
            <h2>{namePrompt.title}</h2>
            <input value={namePrompt.value} onChange={(event) => setNamePrompt({ ...namePrompt, value: event.target.value })} autoFocus />
            <div className="row">
              <button type="button" onClick={() => setNamePrompt(null)}>Cancel</button>
              <button type="submit" className="primary">OK</button>
            </div>
          </form>
        </Modal>
      ) : null}
      {deleteConfirm ? (
        <Modal>
          <div className="card">
            <h2>Delete folder?</h2>
            <p>
              Delete <strong>{deleteConfirm.name}</strong>? The folder must be empty. This cannot be undone.
            </p>
            <div className="row">
              <button type="button" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const { id } = deleteConfirm;
                  setDeleteConfirm(null);
                  performDeleteFolder(id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {missingOpen ? (
        <Modal>
          <div className="card">
            <h2>Missing files</h2>
            {missingFiles.map((file) => <p key={file.id}>{file.sortName}</p>)}
            <div className="row">
              <button type="button" onClick={() => setMissingOpen(false)}>Close</button>
              <button
                type="button"
                onClick={() => {
                  void api.removeMissing().then(() => refreshLists()).finally(() => setMissingOpen(false));
                }}
              >
                Remove entries
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
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
    </div>
  );
}
