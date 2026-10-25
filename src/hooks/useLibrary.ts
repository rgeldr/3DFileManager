import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CheckMenuItem } from "@tauri-apps/api/menu";
import { api } from "../api";
import { useTheme } from "../theme/ThemeProvider";
import type { Browse, DragReport, FileRow, FolderRow, ImportSummary, LibrarySort, Settings, TagCount, TagMatchMode, TypeCount, ViewMode } from "../types";
import {
  acceptHistoryClick,
  emptyHistory,
  historyButton,
  historyKey,
  moveHistory,
  pushFolder,
  samePlace,
} from "../lib/folderHistory";
import { libraryListScope, libraryRefreshKey, librarySearchLimit, truncateLibraryList } from "../lib/tagFilter";
import { extsForSelectedTypes, mergeTypeCounts } from "../lib/typeFilter";
import { useLibraryEffects } from "./useLibraryEffects";
import { useSelection } from "./useSelection";
import {
  emptyProgress,
  type Actions,
  type DiskDialog,
  type DiskProgress,
  type FileDrag,
} from "./libraryTypes";

export function useLibrary() {
  const { theme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [listTruncated, setListTruncated] = useState(false);
  const [history, setHistory] = useState(emptyHistory);
  const browse = history.current;
  const setBrowse = useCallback((next: Browse) => {
    setHistory((current) => pushFolder(current, next));
  }, []);
  const [query, setQuery] = useState("");
  const [creator, setCreator] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [typeCounts, setTypeCounts] = useState<TypeCount[]>(() => mergeTypeCounts([]));
  const [tagMatch, setTagMatch] = useState<TagMatchMode>("any");
  const [sort, setSort] = useState<LibrarySort>({ field: "name", direction: "asc" });
  const [creators, setCreators] = useState<string[]>([]);
  const [creatorOptions, setCreatorOptions] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagCounts, setTagCounts] = useState<TagCount[]>([]);
  const [missingCount, setMissingCount] = useState(0);
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingFiles, setMissingFiles] = useState<FileRow[]>([]);
  const [chosenRoot, setChosenRoot] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importCreator, setImportCreator] = useState("");
  const [importTags, setImportTags] = useState<string[]>([]);
  const [importTagText, setImportTagText] = useState("");
  const [folderTagTarget, setFolderTagTarget] = useState<{ folderId: number | null; name: string; fileIds?: number[] } | null>(null);
  const [creatorTarget, setCreatorTarget] = useState<{ folderId: number | null; name: string; fileIds?: number[] } | null>(null);
  const [creatorValue, setCreatorValue] = useState("");
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [creatorFileCount, setCreatorFileCount] = useState<number | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [tagColorOpen, setTagColorOpen] = useState(false);
  const [aboutVersion, setAboutVersion] = useState<string | null>(null);
  const [aboutVersionFailed, setAboutVersionFailed] = useState(false);
  const [dragFailure, setDragFailure] = useState<{ message: string; fileId: number } | null>(null);
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number; fileId: number } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const [inspectorPinned, setInspectorPinned] = useState(true);
  const [previewHeight, setPreviewHeight] = useState(240);
  const [folderTagInput, setFolderTagInput] = useState("");
  const [folderTagFileCount, setFolderTagFileCount] = useState<number | null>(null);
  const [namePrompt, setNamePrompt] = useState<null | { title: string; value: string; onOk: (value: string) => void }>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<null | { id: number; name: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [diskDialog, setDiskDialog] = useState<DiskDialog | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dragRef = useRef<FileDrag | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const historyRef = useRef(history);
  historyRef.current = history;
  const tryStartRef = useRef<() => void>(() => undefined);
  const prefetchRef = useRef<(ids: number[]) => void>(() => undefined);
  const { selected, setSelected, onSelect, selectedFile } = useSelection(files, prefetchRef);
  const dragPrepCache = useRef<{ key: string; paths: string[]; skipped: string[]; reports: DragReport[] } | null>(null);
  const actions = useRef<Actions>({
    importFolder: () => undefined,
    importArchive: () => undefined,
    moveLibrary: () => undefined,
    backupLibrary: () => undefined,
    restoreLibrary: () => undefined,
    rescan: () => undefined,
    clearThumbs: () => undefined,
    setTheme: () => undefined,
    setGrid: () => undefined,
    showAbout: () => undefined,
    openTagColors: () => undefined,
  });
  const themeItems = useRef<{ dark?: CheckMenuItem; light?: CheckMenuItem }>({});
  const gridItems = useRef<Partial<Record<ViewMode, CheckMenuItem>>>({});
  const [thumbNonce, setThumbNonce] = useState(0);
  const thumbGeneration = useRef(0);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const dragIconRef = useRef<string | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const inspectorWidthRef = useRef(inspectorWidth);
  sidebarWidthRef.current = sidebarWidth;
  inspectorWidthRef.current = inspectorWidth;
  const [previewIconsEnabled, setPreviewIconsEnabled] = useState(false);
  const [folderExpandHint, setFolderExpandHint] = useState<{ key: string; nonce: number } | null>(null);
  const libraryBusy = useRef(false);
  const diskProgress = useRef<DiskProgress>(emptyProgress());
  const toastTimer = useRef<number | null>(null);

  const libraryName = useMemo(() => {
    const root = settings?.libraryRoot;
    if (!root) return "Library";
    const parts = root.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || "Library";
  }, [settings]);

  const targetFolderId = browse.type === "folder" ? browse.id : null;
  const listKeyRef = useRef<string | null>(null);
  const inflightRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const refreshGen = useRef(0);

  const refreshLists = useCallback(async (
    nextBrowse = browse,
    nextQuery = query,
    nextCreator = creator,
    nextSort = sort,
    mode?: "passive",
  ) => {
    const searchScope = settings?.searchScope ?? "library";
    const key = libraryRefreshKey({
      browse: nextBrowse,
      query: nextQuery,
      creator: nextCreator,
      selectedTagIds,
      selectedTypeIds,
      tagMatch,
      sort: nextSort,
      scope: searchScope,
    });
    if (mode === "passive" && (listKeyRef.current === key || inflightRef.current?.key === key)) return;
    const pending = inflightRef.current;
    if (pending?.key === key) return pending.promise;
    const gen = ++refreshGen.current;
    const listed = libraryListScope({
      browse: nextBrowse,
      query: nextQuery,
      creator: nextCreator,
      selectedTagCount: selectedTagIds.length,
      selectedTypeCount: selectedTypeIds.length,
      scope: searchScope,
    });
    const scope = { folder: listed.folder, folderId: listed.folderId, query: nextQuery, creator: listed.creator };
    const searchLimit = librarySearchLimit(listed.folder);
    const exts = extsForSelectedTypes(selectedTypeIds);
    const scopedCreators =
      searchScope === "folder" && nextBrowse.type === "folder"
        ? api.listCreators({ folder: "subtree", folderId: nextBrowse.id })
        : null;
    const promise = (async () => {
      const [rows, creatorRows, tagRows, typeRows, subtreeCreators] = await Promise.all([
        api.listFiles({
          ...scope,
          tag: "",
          tagIds: selectedTagIds,
          tagMatch,
          exts,
          sort: nextSort.field,
          sortDirection: nextSort.direction,
          limit: searchLimit == null ? undefined : searchLimit + 1,
        }),
        api.listCreators(),
        api.listTagCounts({ ...scope, exts }),
        api.listTypeCounts({ ...scope, tagIds: selectedTagIds, tagMatch }),
        scopedCreators ?? Promise.resolve(null),
      ]);
      if (gen !== refreshGen.current) return;
      const page = truncateLibraryList(rows, searchLimit);
      setFiles(page.rows);
      setListTruncated(page.truncated);
      setCreators(creatorRows);
      setCreatorOptions(subtreeCreators ?? creatorRows);
      setTagCounts(tagRows);
      setTypeCounts(mergeTypeCounts(typeRows));
      setTags(tagRows.map((tag) => tag.name));
      listKeyRef.current = key;
    })();
    inflightRef.current = { key, promise };
    try {
      await promise;
    } finally {
      if (inflightRef.current?.promise === promise) inflightRef.current = null;
    }
  }, [browse, creator, query, selectedTagIds, selectedTypeIds, sort, tagMatch, settings?.searchScope]);

  const reloadTree = useCallback(async () => {
    const boot = await api.bootstrap();
    setFolders(boot.folders);
    setMissingCount(boot.missingCount);
    setSettings(boot.settings);
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  const runDiskOp = useCallback(async (opts: {
    title: string;
    cancellable: boolean;
    success: string;
    cancelled: string;
    run: () => Promise<{ cancelled: boolean }>;
    after?: () => Promise<void> | void;
    tree?: boolean;
  }) => {
    if (libraryBusy.current) {
      setError("Another library change is already running.");
      return;
    }
    libraryBusy.current = true;
    diskProgress.current = { ...emptyProgress(), cancellable: opts.cancellable };
    let revealed = false;
    const timer = window.setTimeout(() => {
      revealed = true;
      const progress = diskProgress.current;
      setDiskDialog({
        ...progress,
        title: opts.title,
        cancellable: opts.cancellable && progress.cancellable,
      });
    }, 300);
    try {
      const outcome = await opts.run();
      window.clearTimeout(timer);
      setDiskDialog(null);
      if (opts.after) await opts.after();
      else await refreshLists();
      if (opts.tree) await reloadTree();
      if (revealed) showToast(outcome.cancelled ? opts.cancelled : opts.success);
    } catch (err) {
      window.clearTimeout(timer);
      setDiskDialog(null);
      setError(String(err));
      await refreshLists().catch(() => undefined);
    } finally {
      libraryBusy.current = false;
    }
  }, [refreshLists, reloadTree, showToast]);

  const openNewFolderPrompt = useCallback((parentId: number | null) => {
    setNamePrompt({
      title: "New folder",
      value: "",
      onOk: (value) => {
        const expandKey = parentId == null ? "root" : `folder:${parentId}`;
        void api.createFolder(parentId, value)
          .then(async () => {
            setFolderExpandHint((hint) => ({ key: expandKey, nonce: (hint?.nonce ?? 0) + 1 }));
            await reloadTree();
            return refreshLists();
          })
          .catch((err) => setError(String(err)));
      },
    });
  }, [refreshLists, reloadTree]);

  const openRenameFolderPrompt = useCallback((folderId: number) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    setNamePrompt({
      title: "Rename folder",
      value: folder.name,
      onOk: (value) => {
        void runDiskOp({
          title: `Renaming "${folder.name}"...`,
          cancellable: false,
          success: `Renamed "${value}"`,
          cancelled: "Rename cancelled",
          run: () => api.renameFolder(folder.id, value),
          tree: true,
        });
      },
    });
  }, [folders, runDiskOp]);

  const openDeleteFolderConfirm = useCallback((folderId: number) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    setDeleteConfirm({ id: folderId, name: folder.name });
  }, [folders]);

  const performDeleteFolder = useCallback((folderId: number, name: string) => {
    void runDiskOp({
      title: `Deleting "${name}"...`,
      cancellable: false,
      success: `Deleted "${name}"`,
      cancelled: "Delete cancelled",
      run: () => api.deleteFolder(folderId),
      after: async () => {
        setBrowse({ type: "root" });
        await refreshLists({ type: "root" });
      },
      tree: true,
    });
  }, [refreshLists, runDiskOp]);

  const runImportRef = useRef<(paths: string[]) => Promise<void>>(async () => undefined);

  const refreshListsRef = useRef(refreshLists);
  refreshListsRef.current = refreshLists;
  const runImport = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    if (libraryBusy.current) {
      setError("Another library change is already running.");
      return;
    }
    libraryBusy.current = true;
    setBusy("Importing…");
    setImporting(true);
    setProgress({ current: 0, total: 0, message: "Counting files…" });
    try {
      const result = await api.importPaths(paths, targetFolderId);
      setImportCreator("");
      setImportTags([]);
      setImportTagText("");
      setSummary(result);
      if (result.importedIds.length === 1) setSelected(result.importedIds);
      // An archive adds a folder named after the zip. The file list comes from
      // the catalog, but the sidebar and grid folders come from this list.
      await reloadTree();
      await refreshLists();
    } catch (err) {
      setError(String(err));
    } finally {
      libraryBusy.current = false;
      setImporting(false);
      setBusy(null);
      setProgress(null);
    }
  }, [refreshLists, reloadTree, targetFolderId]);
  runImportRef.current = runImport;

  const dialogOpen = Boolean(
    busy || progress || summary || namePrompt || deleteConfirm || missingOpen || error || diskDialog || aboutOpen || tagColorOpen || creatorTarget || dragFailure,
  );
  const dialogBlockRef = useRef(false);
  dialogBlockRef.current = Boolean(dialogOpen || folderTagTarget || fileMenu);
  const goHistory = useCallback((direction: "back" | "forward") => {
    const exists = (id: number) => foldersRef.current.some((folder) => folder.id === id);
    const next = moveHistory(historyRef.current, direction, exists);
    if (next === historyRef.current) return;
    const moved = !samePlace(historyRef.current.current, next.current);
    historyRef.current = next;
    setHistory(next);
    if (moved) setSelected([]);
  }, [setSelected]);
  useEffect(() => {
    let lastClick = Number.NEGATIVE_INFINITY;
    const onMouse = (event: MouseEvent) => {
      const direction = historyButton(event.button);
      if (!direction) return;
      event.preventDefault();
      if (dialogBlockRef.current) return;
      const now = performance.now();
      if (!acceptHistoryClick(now, lastClick)) return;
      lastClick = now;
      goHistory(direction);
    };
    const onKey = (event: KeyboardEvent) => {
      const direction = historyKey(event);
      if (!direction) return;
      event.preventDefault();
      if (dialogBlockRef.current) return;
      goHistory(direction);
    };
    window.addEventListener("pointerup", onMouse);
    window.addEventListener("mouseup", onMouse);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerup", onMouse);
      window.removeEventListener("mouseup", onMouse);
      window.removeEventListener("keydown", onKey);
    };
  }, [goHistory]);

  const browseKey = browse.type === "folder" ? `folder:${browse.id}` : browse.type;
  const model = {
    theme, setTheme, ready, setReady, settings, setSettings, folders, setFolders, files, setFiles, listTruncated,
    browse, setBrowse, query, setQuery, creator, setCreator, selectedTagIds, setSelectedTagIds,
    selectedTypeIds, setSelectedTypeIds, typeCounts, setTypeCounts,
    tagMatch, setTagMatch, sort, setSort, creators, setCreators, creatorOptions, setCreatorOptions, tags, setTags, tagCounts,
    selected, setSelected, missingCount, setMissingCount,
    missingOpen, setMissingOpen, missingFiles, setMissingFiles, chosenRoot, setChosenRoot,
    busy, setBusy, importing, setImporting, progress, setProgress, summary, setSummary,
    importCreator, setImportCreator, importTags, setImportTags, importTagText, setImportTagText,
    folderTagTarget, setFolderTagTarget, creatorTarget, setCreatorTarget, creatorValue, setCreatorValue,
    includeSubfolders, setIncludeSubfolders, creatorFileCount, setCreatorFileCount,
    aboutOpen, setAboutOpen, tagColorOpen, setTagColorOpen, aboutVersion, setAboutVersion, aboutVersionFailed, setAboutVersionFailed,
    dragFailure, setDragFailure, fileMenu, setFileMenu, sidebarWidth, setSidebarWidth,
    inspectorWidth, setInspectorWidth, inspectorPinned, setInspectorPinned,
    previewHeight, setPreviewHeight,
    folderTagInput, setFolderTagInput, folderTagFileCount, setFolderTagFileCount,
    namePrompt, setNamePrompt, deleteConfirm, setDeleteConfirm, error, setError, diskDialog, setDiskDialog,
    toast, setToast, dragRef, filesRef, tryStartRef, prefetchRef, dragPrepCache, actions, themeItems, gridItems,
    thumbNonce, setThumbNonce, thumbGeneration, gridScrollRef, dragIconRef, sidebarWidthRef, inspectorWidthRef,
    previewIconsEnabled, setPreviewIconsEnabled, folderExpandHint, setFolderExpandHint, libraryBusy, diskProgress,
    toastTimer, libraryName, targetFolderId, refreshLists, reloadTree, showToast, runDiskOp, openNewFolderPrompt,
    openRenameFolderPrompt, openDeleteFolderConfirm, performDeleteFolder, runImportRef, refreshListsRef,
    runImport, dialogOpen, browseKey, onSelect, selectedFile,
  };
  const drag = useLibraryEffects(model);
  return { ...model, ...drag };
}

export type LibraryModel = ReturnType<typeof useLibrary>;
