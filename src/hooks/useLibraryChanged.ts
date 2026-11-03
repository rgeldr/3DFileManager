import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { api } from "../api";
import { clampDetailsColumns } from "../lib/detailsColumns";
import { browseAfterFolderTreeUpdate } from "../lib/folderBrowseFallback";
import {
  debounceLibraryChanged,
  shouldIgnoreLibraryChanged,
  type LibraryChangedPayload,
} from "../lib/libraryChanged";
import { clampInspector, clampSidebar } from "../lib/paneWidths";
import { persistPreviewHeight } from "../lib/previewSplit";
import type { Browse, FolderRow, LibrarySort, Settings } from "../types";

export function useLibraryChanged(s: {
  ready: boolean;
  browse: Browse;
  query: string;
  creator: string;
  sort: LibrarySort;
  foldersRef: { current: FolderRow[] };
  setFolders: React.Dispatch<React.SetStateAction<FolderRow[]>>;
  setMissingCount: React.Dispatch<React.SetStateAction<number>>;
  setSettings: React.Dispatch<React.SetStateAction<Settings | null>>;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  setInspectorWidth: React.Dispatch<React.SetStateAction<number>>;
  setInspectorPinned: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarPinned: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewHeight: (height: number) => void;
  setDetailsColumns: (columns: Settings["detailsColumns"]) => void;
  setTheme: (theme: "dark" | "light") => void;
  setHistory: React.Dispatch<React.SetStateAction<import("../lib/folderHistory").FolderHistory>>;
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  setCreators: React.Dispatch<React.SetStateAction<string[]>>;
  setCreatorOptions: React.Dispatch<React.SetStateAction<string[]>>;
  setTagCounts: React.Dispatch<React.SetStateAction<import("../types").TagCount[]>>;
  setTypeCounts: React.Dispatch<React.SetStateAction<import("../types").TypeCount[]>>;
  refreshLists: (
    nextBrowse?: Browse,
    nextQuery?: string,
    nextCreator?: string,
    nextSort?: LibrarySort,
    mode?: "passive",
  ) => Promise<void>;
  setThumbNonce: React.Dispatch<React.SetStateAction<number>>;
  showToast: (message: string) => void;
  libraryBusy: { current: boolean };
  setBusy: React.Dispatch<React.SetStateAction<string | null>>;
  setImporting: React.Dispatch<React.SetStateAction<boolean>>;
  setProgress: React.Dispatch<
    React.SetStateAction<{ current: number; total: number; message: string } | null>
  >;
  setDiskDialog: React.Dispatch<
    React.SetStateAction<import("./libraryTypes").DiskDialog | null>
  >;
}) {
  const {
    ready,
    browse,
    query,
    creator,
    sort,
    foldersRef,
    setFolders,
    setMissingCount,
    setSettings,
    setSidebarWidth,
    setInspectorWidth,
    setInspectorPinned,
    setSidebarPinned,
    setPreviewHeight,
    setDetailsColumns,
    setTheme,
    setHistory,
    setTags,
    setCreators,
    setCreatorOptions,
    setTagCounts,
    setTypeCounts,
    refreshLists,
    setThumbNonce,
    showToast,
    libraryBusy,
    setBusy,
    setImporting,
    setProgress,
    setDiskDialog,
  } = s;

  const windowLabel = useRef("main");
  useEffect(() => {
    try {
      windowLabel.current = getCurrentWebviewWindow().label;
    } catch {
      windowLabel.current = "main";
    }
  }, []);

  const applySettings = async (settings: Settings) => {
    setSettings(settings);
    setSidebarWidth(clampSidebar(settings.sidebarWidth, window.innerWidth));
    setInspectorWidth(clampInspector(settings.inspectorWidth, window.innerWidth));
    setInspectorPinned(settings.inspectorPinned !== false);
    setSidebarPinned(settings.sidebarPinned !== false);
    setPreviewHeight(persistPreviewHeight(settings.previewHeight, 0));
    setDetailsColumns(clampDetailsColumns(settings.detailsColumns));
    if (settings.theme === "light" || settings.theme === "dark") {
      setTheme(settings.theme);
    }
  };

  useEffect(() => {
    if (!ready) return;
    const debounced = debounceLibraryChanged(
      (callback) => window.setTimeout(callback, 150),
      (id) => window.clearTimeout(id),
      150,
    );

    const handle = async (payload: LibraryChangedPayload) => {
      if (shouldIgnoreLibraryChanged(payload, windowLabel.current)) return;
      libraryBusy.current = false;
      setBusy(null);
      setImporting(false);
      setProgress(null);
      setDiskDialog(null);
      debounced.push(payload.kind, async (kind) => {
        const previousFolders = foldersRef.current;
        if (kind === "settings") {
          const settings = await api.getSettings();
          await applySettings(settings);
          return;
        }
        if (kind === "folders" || kind === "all") {
          const boot = await api.bootstrap();
          setFolders(boot.folders);
          setMissingCount(boot.missingCount);
          if (kind === "all") {
            await applySettings(boot.settings);
          }
          const fallback = browseAfterFolderTreeUpdate(browse, previousFolders, boot.folders);
          if (fallback.notice) showToast(fallback.notice);
          if (fallback.browse !== browse) {
            setHistory((current) => ({ ...current, current: fallback.browse, forward: [] }));
          }
        }
        if (kind === "tags" || kind === "all") {
          const [tagRows, creatorRows, typeRows] = await Promise.all([
            api.listTags(),
            api.listCreators({ folder: "", folderId: null }),
            api.listTypeCounts({
              folder: browse.type === "folder" ? "subtree" : "all",
              folderId: browse.type === "folder" ? browse.id : null,
              query,
              creator,
              tagIds: [],
              tagMatch: "any",
            }),
          ]);
          setTags(tagRows);
          setCreators(creatorRows);
          setCreatorOptions(creatorRows);
          setTagCounts(await api.listTagCounts({
            folder: browse.type === "folder" ? "subtree" : "all",
            folderId: browse.type === "folder" ? browse.id : null,
            query,
            creator,
            exts: [],
          }));
          setTypeCounts(typeRows);
        }
        if (kind === "files" || kind === "all") {
          await refreshLists(undefined, undefined, undefined, sort, "passive");
          setThumbNonce((nonce) => nonce + 1);
        } else if (kind === "folders") {
          await refreshLists(undefined, undefined, undefined, sort, "passive");
        }
      });
    };

    const unlisten = listen<LibraryChangedPayload>("library-changed", (event) => {
      void handle(event.payload).catch(() => undefined);
    });
    return () => {
      debounced.cancel();
      void unlisten.then((stop) => stop());
    };
  }, [ready, browse, query, creator, sort, refreshLists, showToast]);
}
