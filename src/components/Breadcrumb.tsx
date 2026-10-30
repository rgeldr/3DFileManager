import type { Browse, FolderRow } from "../types";
import { folderCrumbs, truncateCrumbs, type Crumb } from "../lib/breadcrumb";

export function Breadcrumb({
  libraryName,
  folders,
  browse,
  onNavigate,
}: {
  libraryName: string;
  folders: FolderRow[];
  browse: Browse;
  onNavigate: (place: Browse) => void;
}) {
  const crumbs = truncateCrumbs(folderCrumbs(libraryName, folders, browse));
  return (
    <nav className="breadcrumb" aria-label="Folder path">
      {crumbs.map((crumb, index) => (
        <span className="breadcrumb-part" key={crumbKey(crumb, index)}>
          {index > 0 ? <span className="breadcrumb-sep"> &gt; </span> : null}
          {crumb.kind === "ellipsis" ? (
            <span className="breadcrumb-ellipsis" aria-hidden="true">…</span>
          ) : (
            <button type="button" className="breadcrumb-segment" onClick={() => onNavigate(crumb.place)}>
              {crumb.label}
            </button>
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
