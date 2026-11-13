import type { Browse, FolderRow } from "../types";
import { breadcrumbTitle, folderCrumbs, truncateCrumbs, type Crumb } from "../lib/breadcrumb";
import { FOLDER_ROOT_DROP_ID } from "../lib/folderMove";

export function Breadcrumb({
  libraryName,
  folders,
  browse,
  dropTarget = null,
  onNavigate,
  fullPath = false,
}: {
  libraryName: string;
  folders: FolderRow[];
  browse: Browse;
  dropTarget?: string | null;
  onNavigate: (place: Browse) => void;
  fullPath?: boolean;
}) {
  const allCrumbs = folderCrumbs(libraryName, folders, browse);
  const crumbs = fullPath ? allCrumbs : truncateCrumbs(allCrumbs);

  const dropIdForCrumb = (crumb: Extract<Crumb, { kind: "place" }>): string | null => {
    if (crumb.place.type === "root") return FOLDER_ROOT_DROP_ID;
    if (crumb.place.type === "folder") return String(crumb.place.id);
    return null;
  };

  return (
    <nav className="breadcrumb" aria-label="Folder path" title={fullPath ? breadcrumbTitle(allCrumbs) : undefined}>
      {crumbs.map((crumb, index) => (
        <span className="breadcrumb-part" key={crumbKey(crumb, index)}>
          {index > 0 ? <span className="breadcrumb-sep"> &gt; </span> : null}
          {crumb.kind === "ellipsis" ? (
            <span className="breadcrumb-ellipsis" aria-hidden="true">…</span>
          ) : (
            (() => {
              const dropId = dropIdForCrumb(crumb);
              const dropClass = dropId != null && dropTarget === dropId ? " drop" : "";
              return (
                <button
                  type="button"
                  className={`breadcrumb-segment${dropClass}`}
                  data-folder-id={dropId ?? undefined}
                  onClick={() => onNavigate(crumb.place)}
                >
                  {crumb.label}
                </button>
              );
            })()
          )}
        </span>
      ))}
    </nav>
  );
}

export function crumbKey(crumb: Crumb, index: number): string {
  if (crumb.kind === "ellipsis") return `ellipsis-${index}`;
  if (crumb.place.type === "root") return "root";
  if (crumb.place.type === "downloads") return "downloads";
  return `folder:${crumb.place.id}`;
}
