import { describe, expect, it } from "vitest";
import {
  browseContainingFolder,
  containingFolderPlace,
  MISSING_FILE_MESSAGE,
  MISSING_FOLDER_MESSAGE,
} from "./containingFolder";
import { emptyHistory } from "./folderHistory";
import type { Browse } from "../types";

const folders = [{ id: 4, parentId: null }, { id: 9, parentId: 4 }];

describe("containing folder", () => {
  it("opens the library root for a file that lives there", () => {
    expect(containingFolderPlace({ folderId: null }, folders)).toEqual({
      ok: true,
      place: { type: "root" },
    });
  });

  it("opens the file's folder when that folder is still in the tree", () => {
    expect(containingFolderPlace({ folderId: 9 }, folders)).toEqual({
      ok: true,
      place: { type: "folder", id: 9 },
    });
  });

  it("refuses a file or folder that is no longer in the library", () => {
    expect(containingFolderPlace(undefined, folders)).toEqual({ ok: false, message: MISSING_FILE_MESSAGE });
    expect(containingFolderPlace({ folderId: 12 }, folders)).toEqual({
      ok: false,
      message: MISSING_FOLDER_MESSAGE,
    });
  });

  it("pushes the folder onto history and leaves history alone when already there", () => {
    const opened = browseContainingFolder(emptyHistory(), { type: "folder", id: 9 });
    expect(opened.current).toEqual({ type: "folder", id: 9 });
    expect(opened.back).toEqual([{ type: "root" }]);
    expect(opened.forward).toEqual([]);

    const forward: Browse[] = [{ type: "folder", id: 4 }];
    const stayed = browseContainingFolder(
      { back: [{ type: "root" }], current: { type: "folder", id: 9 }, forward },
      { type: "folder", id: 9 },
    );
    expect(stayed.current).toEqual({ type: "folder", id: 9 });
    expect(stayed.back).toEqual([{ type: "root" }]);
    expect(stayed.forward).toEqual(forward);
  });
});
