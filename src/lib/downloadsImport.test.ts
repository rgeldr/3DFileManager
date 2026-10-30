import { describe, expect, it } from "vitest";
import { defaultImportDestination } from "./downloadsImport";
import { pushFolder, emptyHistory } from "./folderHistory";

describe("defaultImportDestination", () => {
  it("uses the last non-Downloads place on the back stack", () => {
    let history = pushFolder(emptyHistory(), { type: "folder", id: 2 });
    history = pushFolder(history, { type: "downloads" });
    expect(defaultImportDestination(history)).toEqual({ type: "folder", id: 2 });
  });

  it("falls back to the library root when Downloads was opened from nowhere else", () => {
    const history = pushFolder(emptyHistory(), { type: "downloads" });
    expect(defaultImportDestination(history)).toEqual({ type: "root" });
  });
});
