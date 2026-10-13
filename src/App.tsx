import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { renderMeshStill } from "./lib/renderThumb";
import { useTheme } from "./theme/ThemeProvider";
import type { Browse, FileRow, FolderRow, GridSize, ImportSummary, Settings } from "./types";

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
  const [browse, setBrowse] = useState<Browse>({ type: "all" });
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
  const [progress, setProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [bulk, setBulk] = useState<number[] | null>(null);
  const [bulkCreator, setBulkCreator] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [namePrompt, setNamePrompt] = useState<null | { title: string; value: string; onOk: (value: string) => void }>(null);
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

  const libraryName = useMemo(() => {
    const root = settings?.libraryRoot;
    if (!root) return "Library";
    const parts = root.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || "Library";
  }, [settings]);

  const targetFolderId = browse.type === "folder" ? browse.id : null;

  const refreshLists = useCallback(async (nextBrowse = browse, nextQuery = query, nextCreator = creator, nextTag = tag, nextSort = sort) => {
    const folder = nextBrowse.type === "all" ? "all" : nextBrowse.type === "root" ? "root" : "id";
    const folderId = nextBrowse.type === "folder" ? nextBrowse.id : null;
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

  const runImportRef = useRef<(paths: string[]) => Promise<void>>(async () => undefined);

  const pumpThumbs = useCallback(async () => {
    for (let i = 0; i < 5000; i += 1) {
      const job = await api.nextThumbnail();
      if (!job) break;
      if (job.kind === "render") {
        try {
          const png = await renderMeshStill(convertFileSrc(job.absolutePath), job.ext);
          await api.saveRenderedThumb(job.id, Array.from(png));
        } catch {
          await api.markThumbUnavailable(job.id);
        }
      }
    }
    await refreshLists();
  }, [refreshLists]);

  const runImport = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    setBusy("Importing…");
    setProgress({ current: 0, total: 0, message: "Counting files…" });
    try {
      const result = await api.importPaths(paths, targetFolderId);
      setSummary(result);
      if (result.importedIds.length === 1) setSelected(result.importedIds);
      if (result.importedIds.length > 1) setBulk(result.importedIds);
      await refreshLists();
      void pumpThumbs();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }, [pumpThumbs, refreshLists, targetFolderId]);
  runImportRef.current = runImport;

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
            void pumpThumbs();
          })
          .catch((err) => setError(String(err)))
          .finally(() => setBusy(null));
      },
      clearThumbs: () => {
        void api.clearThumbnailCache().then(() => pumpThumbs()).catch((err) => setError(String(err)));
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
  }, [pumpThumbs, refreshLists, runImport, setTheme]);

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
        void pumpThumbs();
      }
      setReady(true);
    }).catch((err) => {
      setError(String(err));
      setReady(true);
    });
    const drag = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        void runImportRef.current(event.payload.paths);
      }
    });
    const progressUnlisten = listen<{ current: number; total: number; message: string }>("import-progress", (event) => {
      setProgress(event.payload);
    });
    void Promise.all([drag, progressUnlisten]).then(([a, b]) => {
      unlisten = () => {
        a();
        b();
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
        const icon = files.find((file) => drag.ids.includes(file.id) && file.thumbPath)?.thumbPath;
        if (paths.length > 0) {
          void startDrag({ item: paths, icon: icon ?? paths[0] });
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
        onBrowse={(key) => {
          if (key === "all") setBrowse({ type: "all" });
          else if (key === "root") setBrowse({ type: "root" });
          else setBrowse({ type: "folder", id: Number(key.slice(7)) });
          setSelected([]);
        }}
        onNew={() => {
          setNamePrompt({
            title: "New folder",
            value: "",
            onOk: (value) => {
              const parentId = browse.type === "folder" ? browse.id : null;
              void api.createFolder(parentId, value).then(() => refreshLists()).catch((err) => setError(String(err)));
            },
          });
        }}
        onRename={() => {
          if (browse.type !== "folder") return;
          const folder = folders.find((item) => item.id === browse.id);
          if (!folder) return;
          setNamePrompt({
            title: "Rename folder",
            value: folder.name,
            onOk: (value) => {
              void api.renameFolder(folder.id, value).then(() => refreshLists()).catch((err) => setError(String(err)));
            },
          });
        }}
        onDelete={() => {
          if (browse.type !== "folder") return;
          void api.deleteFolder(browse.id).then(() => {
            setBrowse({ type: "all" });
            return refreshLists({ type: "all" });
          }).catch((err) => setError(String(err)));
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
          <div className="grid-wrap">
            <FileGrid
              files={files}
              gridSize={settings.gridSize}
              selected={selected}
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
        <div className="modal-back">
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
          </div>
        </div>
      ) : null}
      {summary ? (
        <div className="modal-back">
          <div className="card">
            <h2>Import finished</h2>
            <p>
              Imported {summary.importedCount}. Duplicates skipped {summary.duplicateCount}. Unsupported {summary.unsupportedCount}.
            </p>
            {summary.failed.length > 0 ? <p>{summary.failed.slice(0, 5).join(" ")}</p> : null}
            {summary.recyclePaths.length > 0 ? (
              <p>Keep the originals, or move them to the Recycle Bin?</p>
            ) : null}
            <div className="row">
              <button type="button" className="primary" onClick={() => setSummary(null)}>Keep originals</button>
              {summary.recyclePaths.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    void api.recyclePaths(summary.recyclePaths).then((failed) => {
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
        </div>
      ) : null}
      {bulk ? (
        <div className="modal-back">
          <div className="card">
            <h2>Tag this import</h2>
            <p>Apply a creator and tags to the {bulk.length} files just imported.</p>
            <input placeholder="Creator" value={bulkCreator} onChange={(event) => setBulkCreator(event.target.value)} />
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
        </div>
      ) : null}
      {namePrompt ? (
        <div className="modal-back">
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
        </div>
      ) : null}
      {missingOpen ? (
        <div className="modal-back">
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
        </div>
      ) : null}
      {error ? (
        <div className="modal-back">
          <div className="card">
            <h2>Something went wrong</h2>
            <p>{error}</p>
            <div className="row">
              <button type="button" className="primary" onClick={() => setError(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
