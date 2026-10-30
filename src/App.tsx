import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import { Breadcrumb } from "./components/Breadcrumb";
import { FileGrid } from "./components/FileGrid";
import { LibrarySearch } from "./components/LibrarySearch";
import { TagFilter } from "./components/TagFilter";
import { TypeFilter } from "./components/TypeFilter";
import { MenuBar } from "./components/MenuBar";
import { Sidebar } from "./components/Sidebar";
import { Inspector } from "./components/Inspector";
import {
  AboutDialog,
  ExternalProgramsDialog,
  TagColorDialog,
  CreatorDialog,
  DeleteFolderDialog,
  DiskProgressDialog,
  DragFailureDialog,
  ErrorDialog,
  FileContextMenu,
  FolderContextMenu,
  FolderTagDialog,
  ImportProgressDialog,
  ImportSummaryDialog,
  MissingFilesDialog,
  NamePromptDialog,
  Toast,
} from "./components/dialogs";
import { DownloadsPanel, nextDownloadSort, pickDownloadsFolder } from "./components/DownloadsPanel";
import { DownloadsInspector } from "./components/DownloadsInspector";
import { AddToLibraryDialog } from "./components/dialogs/AddToLibraryDialog";
import { DownloadsContextMenu } from "./components/dialogs/DownloadsContextMenu";
import { UpdateBanner } from "./components/UpdateBanner";
import { useLibrary, type LibraryModel } from "./hooks/useLibrary";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useThumbQueueCount } from "./hooks/useThumbQueueCount";
import { clampInspector, clampSidebar, INSPECTOR_RAIL_WIDTH } from "./lib/paneWidths";
import { centerSubfolders, gridEmptyMessage, LIBRARY_SEARCH_LIMIT, nextSort, sortFromDropdown, truncatedSearchMessage } from "./lib/tagFilter";
import type { SearchScope, SortField, ViewMode } from "./types";

export function App() {
  const app = useLibrary();
  return <AppShell app={app} />;
}

export function AppShell({ app }: { app: LibraryModel }) {
  const updateCheck = useAppUpdate();
  const {
    ready,
    settings,
    setSettings,
    folders,
    setFolders,
    files,
    browse,
    setBrowse,
    query,
    setQuery,
    creator,
    setCreator,
    selectedTagIds,
    setSelectedTagIds,
    selectedTypeIds,
    setSelectedTypeIds,
    typeCounts,
    tagMatch,
    setTagMatch,
    tagCounts,
    sort,
    setSort,
    creators,
    creatorOptions,
    tags,
    selected,
    setSelected,
    missingCount,
    listTruncated,
    setMissingCount,
    setMissingOpen,
    setMissingFiles,
    chosenRoot,
    setChosenRoot,
    setFolderTagTarget,
    setCreatorTarget,
    setCreatorValue,
    setIncludeSubfolders,
    setFileMenu,
    sidebarWidth,
    setSidebarWidth,
    inspectorWidth,
    setInspectorWidth,
    inspectorPinned,
    setInspectorPinned,
    sidebarPinned,
    setSidebarPinned,
    previewHeight,
    setPreviewHeight,
    detailsColumns,
    setDetailsColumns,
    setFolderTagInput,
    error,
    setError,
    actions,
    gridScrollRef,
    sidebarWidthRef,
    inspectorWidthRef,
    previewIconsEnabled,
    folderExpandHint,
    setFolderExpandHint,
    libraryName,
    refreshLists,
    runDiskOp,
    openNewFolderPrompt,
    openRenameFolderPrompt,
    openDeleteFolderConfirm,
    browseKey,
    onSelect,
    selectedFile,
    dropTarget,
    onPointerDown
  } = app;
  const {
    downloadsList,
    downloadsTruncated,
    downloadSort,
    setDownloadSort,
    downloadsSelected,
    setDownloadsSelected,
    downloadsMenu,
    setDownloadsMenu,
    refreshDownloads,
    applyDownloadsFolder,
    selectedDownloadRow,
    addToLibraryPaths,
    setAddToLibraryPaths,
    defaultImportDestination,
  } = app;
  const onDownloads = browse.type === "downloads";
  const [gridFolderMenu, setGridFolderMenu] = useState<{ x: number; y: number; folderId: number } | null>(null);
  const thumbQueue = useThumbQueueCount(ready && Boolean(settings?.libraryRoot));
  const subfolders = centerSubfolders({
    folders,
    browse,
    query,
    creator,
    selectedTagCount: selectedTagIds.length,
    selectedTypeCount: selectedTypeIds.length,
  });
  const creatorSelectOptions = creatorOptions.includes(creator) || creator === ""
    ? creatorOptions
    : [...creatorOptions, creator];
  const onPanePointerDown = (which: "sidebar" | "inspector") => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const origin = which === "sidebar" ? sidebarWidthRef.current : inspectorWidthRef.current;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (dx !== 0) moved = true;
      if (which === "sidebar") {
        const next = clampSidebar(origin + dx, window.innerWidth);
        sidebarWidthRef.current = next;
        setSidebarWidth(next);
      } else {
        const next = clampInspector(origin - dx, window.innerWidth);
        inspectorWidthRef.current = next;
        setInspectorWidth(next);
      }
    };
    const up = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
      if (!moved) return;
      void api.setPaneWidths(sidebarWidthRef.current, inspectorWidthRef.current).catch((err) => setError(String(err)));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  const paneStyle = {
    "--sidebar-width": `${sidebarPinned ? sidebarWidth : INSPECTOR_RAIL_WIDTH}px`,
    "--inspector-width": `${inspectorPinned ? inspectorWidth : INSPECTOR_RAIL_WIDTH}px`,
  } as CSSProperties;
  if (!ready || !settings) {
    return <div className="setup"><p>Loading…</p></div>;
  }

  if (!settings.libraryRoot) {
    return (
      <div className="setup">
        <div className="card">
          <h1>3D File Library</h1>
          <p>Start a new library, or import a backup from another computer or drive.</p>

          <h2>New library</h2>
          <p className="muted">Choose an empty folder for this app to store library copies.</p>
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

          <h2>Import backup</h2>
          <p className="muted">
            Pick a folder created by Backup library… Then choose where the restored library files should live
            {chosenRoot ? " (or use the folder selected above)." : "."}
          </p>
          <div className="row">
            <button
              type="button"
              className="primary"
              onClick={() => actions.current.restoreLibrary(chosenRoot ?? undefined)}
            >
              Import backup folder…
            </button>
          </div>
          {error ? <p>{error}</p> : null}
        </div>
        <DiskProgressDialog app={app} />
        <ErrorDialog app={app} />
        <Toast app={app} />
      </div>
    );
  }

  const onRevealFolder = (folderId: number | null) => {
    void api.revealFolder(folderId).catch((err) => setError(String(err)));
  };
  const onRescanFolder = (folderId: number | null) => {
    const name = folderId == null
      ? libraryName
      : folders.find((item) => item.id === folderId)?.name ?? "folder";
    void runDiskOp({
      title: `Rescanning "${name}"...`,
      cancellable: true,
      success: "Rescan finished",
      cancelled: "Rescan cancelled",
      run: () => (folderId == null ? api.rescanLibrary() : api.rescanFolder(folderId)),
      after: async () => {
        await refreshLists();
      },
      tree: true,
    });
  };
  const onTagFolder = (folderId: number | null) => {
    const name =
      folderId === null
        ? libraryName
        : folders.find((item) => item.id === folderId)?.name ?? "Folder";
    setFolderTagInput("");
    setFolderTagTarget({ folderId, name });
  };
  const onSetFolderCreator = (folderId: number | null) => {
    const name =
      folderId === null
        ? libraryName
        : folders.find((item) => item.id === folderId)?.name ?? "Folder";
    setCreatorValue("");
    setIncludeSubfolders(true);
    setCreatorTarget({ folderId, name });
  };

  return (
    <div
      className="app"
      style={paneStyle}
      onPointerDown={onPointerDown}
    >
      <MenuBar
        theme={app.theme}
        settings={settings}
        ready={ready}
        actions={actions}
        themeItems={app.themeItems}
        gridItems={app.gridItems}
      />
      <div className={`app-panes${sidebarPinned ? "" : " sidebar-collapsed"}`}>
      <Sidebar
        folders={folders}
        libraryName={libraryName}
        browseKey={browseKey}
        dropTarget={dropTarget}
        expandHint={folderExpandHint}
        onBrowse={(key) => {
          if (key === "downloads") setBrowse({ type: "downloads" });
          else if (key === "root") setBrowse({ type: "root" });
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
        pinned={sidebarPinned}
        onPinnedChange={(next) => {
          setSidebarPinned(next);
          setSettings((current) => (current ? { ...current, sidebarPinned: next } : current));
          void api.setSidebarPinned(next).catch((err) => setError(String(err)));
        }}
        onReveal={onRevealFolder}
        onRescan={onRescanFolder}
        onTagFolder={onTagFolder}
        onSetCreator={onSetFolderCreator}
        onMoveFolder={(id, parentId) => {
          const name = folders.find((item) => item.id === id)?.name ?? "folder";
          const expandKey = parentId == null ? "root" : `folder:${parentId}`;
          void runDiskOp({
            title: `Moving "${name}"...`,
            cancellable: true,
            success: `Moved "${name}"`,
            cancelled: "Move cancelled",
            run: () => api.moveFolder(id, parentId),
            tree: true,
            after: async () => {
              setFolderExpandHint((hint) => ({ key: expandKey, nonce: (hint?.nonce ?? 0) + 1 }));
              await refreshLists();
            },
          });
        }}
      />
      {sidebarPinned ? (
        <div
          className="pane-splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize folders"
          tabIndex={0}
          onPointerDown={onPanePointerDown("sidebar")}
        />
      ) : null}
      <section className="main">
        <div className="toolbar">
          <Breadcrumb
            libraryName={libraryName}
            folders={folders}
            browse={browse}
            onNavigate={(place) => {
              const same =
                place.type === "downloads"
                  ? browse.type === "downloads"
                  : place.type === "root"
                    ? browse.type === "root"
                    : browse.type === "folder" && browse.id === place.id;
              if (same) return;
              setBrowse(place);
              setSelected([]);
            }}
          />
          <div className="toolbar-leading">
            {onDownloads ? (
              <button
                type="button"
                className="toolbar-refresh"
                onClick={() => void refreshDownloads().catch((err) => setError(String(err)))}
              >
                Refresh
              </button>
            ) : null}
            <LibrarySearch
              disabled={onDownloads}
              query={query}
              creator={creator}
              selectedTagIds={selectedTagIds}
              selectedTypeIds={selectedTypeIds}
              tags={tagCounts}
              types={typeCounts}
              scope={settings?.searchScope ?? "library"}
              onScope={(scope: SearchScope) => {
                setSettings((current) => (current ? { ...current, searchScope: scope } : current));
                void api.setSearchScope(scope).catch((err) => setError(String(err)));
              }}
              onQuery={setQuery}
              onClear={() => {
                setQuery("");
                setCreator("");
                setSelectedTypeIds([]);
                setSelectedTagIds([]);
              }}
              onSelectedTagIds={setSelectedTagIds}
              onSelectedTypeIds={setSelectedTypeIds}
            />
          </div>
          <fieldset className="toolbar-filters toolbar-controls" disabled={onDownloads}>
            <div className="toolbar-row">
              <TypeFilter
                types={typeCounts}
                selectedIds={selectedTypeIds}
                onSelectedIds={setSelectedTypeIds}
              />
              <TagFilter
                tags={tagCounts}
                selectedIds={selectedTagIds}
                match={tagMatch}
                onSelectedIds={setSelectedTagIds}
                onMatch={setTagMatch}
              />
            </div>
            <div className="toolbar-row">
              <select aria-label="Creator" value={creator} onChange={(event) => setCreator(event.target.value)} disabled={onDownloads}>
                <option value="">All creators</option>
                {creatorSelectOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select
                aria-label="Sort"
                value={sort.field}
                onChange={(event) => setSort(sortFromDropdown(event.target.value as SortField))}
                disabled={onDownloads}
              >
                <option value="name">Sort name</option>
                <option value="size">Size</option>
                <option value="modified">Date modified</option>
                <option value="date">Date added</option>
                <option value="creator">Creator</option>
              </select>
            </div>
          </fieldset>
        </div>
        {onDownloads && downloadsTruncated ? (
          <div className="banner">
            <span>The Downloads list is truncated. Narrow the folder or remove files to see more.</span>
          </div>
        ) : null}
        {onDownloads ? null : listTruncated ? (
          <div className="banner">
            <span>{truncatedSearchMessage(LIBRARY_SEARCH_LIMIT)}</span>
          </div>
        ) : null}
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
        {updateCheck.banner ? <UpdateBanner {...updateCheck.banner} /> : null}
        <div className={`workspace${inspectorPinned ? "" : " inspector-collapsed"}`}>
          <div className="grid-wrap" ref={gridScrollRef} tabIndex={-1}>
            {onDownloads ? (
              <DownloadsPanel
                list={downloadsList}
                sort={downloadSort}
                onSort={(field) => setDownloadSort(nextDownloadSort(downloadSort, field))}
                selected={downloadsSelected}
                onSelectionChange={setDownloadsSelected}
                onContextMenu={(event, _path, selection) => {
                  setDownloadsMenu({ x: event.clientX, y: event.clientY, path: _path, selection });
                }}
                onSetFolder={() => {
                  void pickDownloadsFolder().then((path) => {
                    if (path) void applyDownloadsFolder(path).catch((err) => setError(String(err)));
                  });
                }}
                onClearFolder={() => {
                  void applyDownloadsFolder(null).catch((err) => setError(String(err)));
                }}
              />
            ) : (
            <FileGrid
              files={files}
              folders={subfolders}
              emptyMessage={gridEmptyMessage({
                selectedTagCount: selectedTagIds.length,
                selectedTypeCount: selectedTypeIds.length,
                creator,
                query,
              })}
              view={settings.gridSize}
              sort={sort}
              onClearFilters={
                selectedTypeIds.length > 0 || selectedTagIds.length > 0
                  ? () => {
                      setSelectedTypeIds([]);
                      setSelectedTagIds([]);
                    }
                  : undefined
              }
              selected={selected}
              previewIconsEnabled={previewIconsEnabled}
              scrollRootRef={gridScrollRef}
              onSelect={onSelect}
              onSelectionChange={setSelected}
              onOpen={(file) => {
                void api.openInDefaultApp(file.id).catch((err) => setError(String(err)));
              }}
              onOpenFolder={(id) => {
                setBrowse({ type: "folder", id });
                setSelected([]);
              }}
              onSort={(field) => setSort(nextSort(sort, field))}
              detailsColumns={detailsColumns}
              onDetailsColumnResize={(id, width) => {
                setDetailsColumns((current) => ({ ...current, [id]: width }));
              }}
              onDetailsColumnResizeEnd={(id, width) => {
                setDetailsColumns((current) => {
                  const next = { ...current, [id]: width };
                  void api.setDetailsColumns(next).catch((err) => setError(String(err)));
                  return next;
                });
              }}
              onContextMenu={(event, file) => {
                if (!selected.includes(file.id)) onSelect(file.id, "replace");
                setGridFolderMenu(null);
                setFileMenu({ x: event.clientX, y: event.clientY, fileId: file.id });
              }}
              onFolderContextMenu={(event, folderId) => {
                setFileMenu(null);
                setGridFolderMenu({ x: event.clientX, y: event.clientY, folderId });
              }}
            />
            )}
          </div>
          {inspectorPinned ? (
            <div
              className="pane-splitter"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize details"
              tabIndex={0}
              onPointerDown={onPanePointerDown("inspector")}
            />
          ) : null}
          {onDownloads ? (
            <DownloadsInspector
              row={selectedDownloadRow}
              pinned={inspectorPinned}
              onPinnedChange={(next) => {
                setInspectorPinned(next);
                setSettings((current) => (current ? { ...current, inspectorPinned: next } : current));
                void api.setInspectorPinned(next).catch((err) => setError(String(err)));
              }}
            />
          ) : (
          <Inspector
            file={selectedFile}
            folders={folders}
            creators={creators}
            knownTags={tags}
            tagCounts={tagCounts}
            pinned={inspectorPinned}
            onPinnedChange={(next) => {
              setInspectorPinned(next);
              setSettings((current) => (current ? { ...current, inspectorPinned: next } : current));
              void api.setInspectorPinned(next).catch((err) => setError(String(err)));
            }}
            onSave={(file, nextTags) => {
              const moving = file.folderId !== selectedFile?.folderId;
              void runDiskOp({
                title: moving ? `Moving "${file.sortName}"...` : "Saving...",
                cancellable: moving,
                success: moving ? `Moved "${file.sortName}"` : "Saved",
                cancelled: "Move cancelled",
                run: async () => {
                  const outcome = await api.updateFile({
                    id: file.id,
                    sortName: file.sortName,
                    creator: file.creator,
                    notes: file.notes,
                    folderId: file.folderId,
                  });
                  if (!outcome.cancelled) await api.setTags(file.id, nextTags);
                  return outcome;
                },
              });
            }}
            previewHeight={previewHeight}
            onPreviewHeight={(height) => {
              setPreviewHeight(height);
              void api.setPreviewHeight(height).catch((err) => setError(String(err)));
            }}
            onDelete={(id) => {
              const name = files.find((file) => file.id === id)?.sortName ?? "file";
              void runDiskOp({
                title: `Deleting "${name}"...`,
                cancellable: true,
                success: `Deleted "${name}"`,
                cancelled: "Delete cancelled",
                run: () => api.deleteFiles([id]),
                tree: true,
                after: async () => {
                  setSelected([]);
                  await refreshLists();
                },
              });
            }}
          />
          )}
        </div>
        <footer className="status">
          <span>
            {onDownloads
              ? downloadsList.status === "ok"
                ? `${downloadsList.rows.length === 1 ? "1 file" : `${downloadsList.rows.length} files`}${downloadsSelected.length ? ` · ${downloadsSelected.length} selected` : ""}`
                : "Downloads"
              : `${files.length === 1 ? "1 file" : `${files.length} files`}${selected.length ? ` · ${selected.length} selected` : ""}${thumbQueue > 0 ? ` · ${thumbQueue} thumbnail${thumbQueue === 1 ? "" : "s"} still generating` : ""}`}
          </span>
          {onDownloads ? null : (
          <div className="view-toggle">
            {(
              [
                ["medium", "Medium"],
                ["large", "Large"],
                ["extraLarge", "Extra large"],
                ["list", "List"],
                ["details", "Details"],
              ] as [ViewMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={settings.gridSize === mode ? "active" : ""}
                onClick={() => actions.current.setGrid(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          )}
        </footer>
      </section>
      </div>
      <ImportProgressDialog app={app} />
      <ImportSummaryDialog app={app} />
      {addToLibraryPaths ? (
        <AddToLibraryDialog
          app={app}
          paths={addToLibraryPaths}
          defaultPlace={defaultImportDestination}
          onClose={() => setAddToLibraryPaths(null)}
        />
      ) : null}
      <FolderTagDialog app={app} />
      <CreatorDialog app={app} />
      <AboutDialog app={app} updates={updateCheck.about} />
      <TagColorDialog app={app} />
      <ExternalProgramsDialog app={app} />
      <DragFailureDialog app={app} />
      <NamePromptDialog app={app} />
      <DeleteFolderDialog app={app} />
      <MissingFilesDialog app={app} />
      <DiskProgressDialog app={app} />
      <Toast app={app} />
      <FileContextMenu app={app} />
      <DownloadsContextMenu app={app} menu={downloadsMenu} onClose={() => setDownloadsMenu(null)} />
      <FolderContextMenu
        menu={gridFolderMenu}
        onClose={() => setGridFolderMenu(null)}
        onNewInFolder={openNewFolderPrompt}
        onRenameFolder={openRenameFolderPrompt}
        onDeleteFolder={openDeleteFolderConfirm}
        onTagFolder={onTagFolder}
        onSetCreator={onSetFolderCreator}
        onReveal={onRevealFolder}
        onRescan={onRescanFolder}
      />
      <ErrorDialog app={app} />
    </div>
  );
}
