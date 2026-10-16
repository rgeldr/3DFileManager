import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import { FileGrid } from "./components/FileGrid";
import { TagFilter } from "./components/TagFilter";
import { FilterChips, TypeFilter } from "./components/TypeFilter";
import { MenuBar } from "./components/MenuBar";
import { Sidebar } from "./components/Sidebar";
import { Inspector } from "./components/Inspector";
import {
  AboutDialog,
  CreatorDialog,
  DeleteFolderDialog,
  DiskProgressDialog,
  DragFailureDialog,
  ErrorDialog,
  FileContextMenu,
  FolderTagDialog,
  ImportProgressDialog,
  ImportSummaryDialog,
  MissingFilesDialog,
  NamePromptDialog,
  Toast,
} from "./components/dialogs";
import { useLibrary, type LibraryModel } from "./hooks/useLibrary";
import { useThumbQueueCount } from "./hooks/useThumbQueueCount";
import { clampInspector, clampSidebar } from "./lib/paneWidths";
import { gridEmptyMessage } from "./lib/tagFilter";
import type { GridSize } from "./types";

export function App() {
  const app = useLibrary();
  return <AppShell app={app} />;
}

function AppShell({ app }: { app: LibraryModel }) {
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
    tags,
    selected,
    setSelected,
    missingCount,
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
    previewHeight,
    setPreviewHeight,
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
  const thumbQueue = useThumbQueueCount(ready && Boolean(settings?.libraryRoot));
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
    "--sidebar-width": `${sidebarWidth}px`,
    "--inspector-width": `${inspectorWidth}px`,
  } as CSSProperties;
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
      <div className="app-panes">
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
        onSetCreator={(folderId) => {
          const name =
            folderId === null
              ? libraryName
              : folders.find((item) => item.id === folderId)?.name ?? "Folder";
          setCreatorValue("");
          setIncludeSubfolders(true);
          setCreatorTarget({ folderId, name });
        }}
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
      <div
        className="pane-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize folders"
        tabIndex={0}
        onPointerDown={onPanePointerDown("sidebar")}
      />
      <section className="main">
        <div className="toolbar">
          <div className="toolbar-search">
            <input
              type="search"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <FilterChips
              tags={tagCounts}
              types={typeCounts}
              selectedTagIds={selectedTagIds}
              selectedTypeIds={selectedTypeIds}
              onSelectedTagIds={setSelectedTagIds}
              onSelectedTypeIds={setSelectedTypeIds}
            />
          </div>
          <div className="toolbar-controls">
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
              <select aria-label="Creator" value={creator} onChange={(event) => setCreator(event.target.value)}>
                <option value="">All creators</option>
                {creators.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="name">Sort name</option>
                <option value="creator">Creator</option>
                <option value="date">Date added</option>
              </select>
            </div>
          </div>
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
          <div className="grid-wrap" ref={gridScrollRef} tabIndex={-1}>
            <FileGrid
              files={files}
              emptyMessage={gridEmptyMessage({
                selectedTagCount: selectedTagIds.length,
                selectedTypeCount: selectedTypeIds.length,
                creator,
                query,
              })}
              gridSize={settings.gridSize}
              selected={selected}
              previewIconsEnabled={previewIconsEnabled}
              scrollRootRef={gridScrollRef}
              onSelect={onSelect}
              onSelectionChange={setSelected}
              onOpen={(file) => {
                void api.openInDefaultApp(file.id).catch((err) => setError(String(err)));
              }}
              onContextMenu={(event, file) => {
                setFileMenu({ x: event.clientX, y: event.clientY, fileId: file.id });
              }}
            />
          </div>
          <div
            className="pane-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize details"
            tabIndex={0}
            onPointerDown={onPanePointerDown("inspector")}
          />
          <Inspector
            file={selectedFile}
            folders={folders}
            creators={creators}
            knownTags={tags}
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
        </div>
        <footer className="status">
          <span>
            {files.length === 1 ? "1 file" : `${files.length} files`}
            {selected.length ? ` · ${selected.length} selected` : ""}
            {thumbQueue > 0
              ? ` · ${thumbQueue} thumbnail${thumbQueue === 1 ? "" : "s"} still generating`
              : ""}
          </span>
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
      </div>
      <ImportProgressDialog app={app} />
      <ImportSummaryDialog app={app} />
      <FolderTagDialog app={app} />
      <CreatorDialog app={app} />
      <AboutDialog app={app} />
      <DragFailureDialog app={app} />
      <NamePromptDialog app={app} />
      <DeleteFolderDialog app={app} />
      <MissingFilesDialog app={app} />
      <DiskProgressDialog app={app} />
      <Toast app={app} />
      <FileContextMenu app={app} />
      <ErrorDialog app={app} />
    </div>
  );
}
