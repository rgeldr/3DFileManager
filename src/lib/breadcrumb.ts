import type { Browse, FolderRow } from "../types";

export type Crumb =
  | { kind: "place"; place: Browse; label: string }
  | { kind: "ellipsis" };

const VISIBLE_CRUMBS = 4;

export function folderCrumbs(libraryName: string, folders: FolderRow[], browse: Browse): Crumb[] {
  const root: Crumb = { kind: "place", place: { type: "root" }, label: libraryName };
  if (browse.type === "root") return [root];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const chain: Crumb[] = [];
  const seen = new Set<number>();
  let id: number | null = browse.id;
  while (id != null) {
    if (seen.has(id)) break;
    seen.add(id);
    const folder = byId.get(id);
    if (!folder) return chain.length === 0 ? [root] : [root, ...chain.reverse()];
    chain.push({ kind: "place", place: { type: "folder", id: folder.id }, label: folder.name });
    id = folder.parentId;
  }
  return [root, ...chain.reverse()];
}

/** Keep the library name and the two closest folders when the path is longer than four segments. */
export function truncateCrumbs(crumbs: Crumb[], max = VISIBLE_CRUMBS): Crumb[] {
  const places = crumbs.filter((crumb): crumb is Extract<Crumb, { kind: "place" }> => crumb.kind === "place");
  if (places.length <= max) return places;
  return [places[0], { kind: "ellipsis" }, ...places.slice(-2)];
}
