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
import { samePlace } from "../lib/folderHistory";
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
  refreshDownloads: () => Promise<void>;
  setThumbNonce: React.Dispatch<React.SetStateAction<number>>;
  showToast: (message: string) => void;
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
    refreshDownloads,
    setThumbNonce,
    showToast,
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
    );

    const handle = async (payload: LibraryChangedPayload) => {
      if (shouldIgnoreLibraryChanged(payload, windowLabel.current)) return;
      debounced.push(payload.kind, async (kind) => {
        const previousFolders = foldersRef.current;
        let nextBrowse = browse;
        if (kind === "settings") {
          const settings = await api.getSettings();
          await applySettings(settings);
          if (browse.type === "downloads") await refreshDownloads();
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
          if (!samePlace(fallback.browse, browse)) {
            nextBrowse = fallback.browse;
            setHistory((current) => ({ ...current, current: fallback.browse, forward: [] }));
          }
        }
        if (kind === "tags" || kind === "all") {
          const folderId = nextBrowse.type === "folder" ? nextBrowse.id : null;
          const folder = nextBrowse.type === "folder" ? "subtree" : "all";
          const [tagRows, creatorRows, typeRows, tagCounts] = await Promise.all([
            api.listTags(),
            api.listCreators({ folder: "", folderId: null }),
            api.listTypeCounts({
              folder,
              folderId,
              query,
              creator,
              tagIds: [],
              tagMatch: "any",
            }),
            api.listTagCounts({
              folder,
              folderId,
              query,
              creator,
              exts: [],
            }),
          ]);
          setTags(tagRows);
          setCreators(creatorRows);
          setCreatorOptions(creatorRows);
          setTagCounts(tagCounts);
          setTypeCounts(typeRows);
        }
        if (kind === "files" || kind === "folders" || kind === "all" || kind === "tags") {
          await refreshLists(nextBrowse, query, creator, sort);
          if (kind !== "folders") setThumbNonce((nonce) => nonce + 1);
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
  }, [ready, browse, query, creator, sort, refreshLists, refreshDownloads, showToast]);
}
