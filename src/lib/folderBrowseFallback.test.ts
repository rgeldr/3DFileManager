import { describe, expect, it } from "vitest";
import { browseAfterFolderTreeUpdate, FOLDER_REMOVED_NOTICE } from "./folderBrowseFallback";

describe("browseAfterFolderTreeUpdate", () => {
  const folders = [
    { id: 1, parentId: null, name: "Rootish", relpath: "Rootish", sortOrder: 0 },
    { id: 2, parentId: 1, name: "Child", relpath: "Rootish/Child", sortOrder: 0 },
  ];

  it("keeps browse when the folder still exists", () => {
    const result = browseAfterFolderTreeUpdate(
      { type: "folder", id: 2 },
      folders,
      folders,
    );
    expect(result.notice).toBeNull();
    expect(result.browse).toEqual({ type: "folder", id: 2 });
  });

  it("falls back to the parent folder when the current one disappears", () => {
    const next = [folders[0]];
    const result = browseAfterFolderTreeUpdate(
      { type: "folder", id: 2 },
      folders,
      next,
    );
    expect(result.browse).toEqual({ type: "folder", id: 1 });
    expect(result.notice).toBe(FOLDER_REMOVED_NOTICE);
  });

  it("falls back to root when parent is gone too", () => {
    const result = browseAfterFolderTreeUpdate(
      { type: "folder", id: 2 },
      folders,
      [],
    );
    expect(result.browse).toEqual({ type: "root" });
    expect(result.notice).toBe(FOLDER_REMOVED_NOTICE);
  });
});
