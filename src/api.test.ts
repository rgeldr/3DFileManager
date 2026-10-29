import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoked: string[] = [];
const invokedArgs: { cmd: string; args: unknown }[] = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: unknown) => {
    invoked.push(cmd);
    invokedArgs.push({ cmd, args });
    return Promise.resolve(undefined);
  }),
}));

import { api } from "./api";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const libRs = readFileSync(join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");

function registeredCommands(source: string): Set<string> {
  const block = source.match(/generate_handler!\[([\s\S]*?)\]/);
  if (!block) throw new Error("generate_handler block not found");
  return new Set(
    block[1]
      .split(",")
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

const sampleArgs: Record<string, unknown[]> = {
  setLibraryRoot: ["/library"],
  moveLibraryRoot: ["/library"],
  setTheme: ["dark"],
  setGridSize: ["large"],
  setSearchScope: ["library"],
  setPaneWidths: [240, 320],
  setPreviewHeight: [240],
  setDetailsColumns: [{ name: 240, size: 96, modified: 176, added: 176, creator: 128 }],
  setInspectorPinned: [true],
  setSidebarPinned: [true],
  setExternalPrograms: [[{ id: "orca", name: "OrcaSlicer", path: "C:\\Program Files\\OrcaSlicer\\orca-slicer.exe" }]],
  openInProgram: [1, "orca"],
  revealFolder: [null],
  rescanFolder: [1],
  createFolder: [null, "New"],
  renameFolder: [1, "Renamed"],
  deleteFolder: [1],
  moveFolder: [1, null],
  listFiles: [
    {
      folder: "root",
      folderId: null,
      query: "",
      creator: "",
      tag: "",
      tagIds: [],
      tagMatch: "any",
      exts: [],
      sort: "name",
      sortDirection: "asc",
    },
  ],
  renameFile: [1, "file"],
  updateFile: [{ id: 1, sortName: "a", creator: "", notes: "", folderId: null }],
  setTags: [1, ["tag"]],
  addTagsUnderFolder: [null, ["tag"]],
  addTagsToFiles: [[1], ["tag"]],
  applyBulkMeta: [[1], "Ada", ["tag"]],
  countFilesForScope: [null, true],
  setCreatorUnderFolder: [null, "Ada", true],
  listCreators: [{ folder: "", folderId: null }],
  setTagColor: [1, null],
  listTagCounts: [{ folder: "root", folderId: null, query: "", creator: "", exts: [] }],
  listTypeCounts: [{ folder: "root", folderId: null, query: "", creator: "", tagIds: [], tagMatch: "any" }],
  importPaths: [["/tmp/a.zip"], null],
  recyclePaths: [["/tmp/a.stl"]],
  moveFiles: [[1], null],
  deleteFiles: [[1]],
  exportLibraryBackup: ["/backup"],
  restoreLibraryBackup: ["/backup", "/library"],
  saveRenderedThumb: [1, [1, 2, 3]],
  markThumbUnavailable: [1],
  releaseRenderingThumb: [1],
  debugLog: ["line"],
  prepareDragPaths: [[1], "/icon.png"],
  openInDefaultApp: [1],
  revealFile: [1],
  textPreview: [1],
};

describe("api command contract", () => {
  beforeEach(() => {
    invoked.length = 0;
    invokedArgs.length = 0;
  });

  it("invokes a registered Tauri command for every api wrapper", async () => {
    const registered = registeredCommands(libRs);
    for (const [name, fn] of Object.entries(api)) {
      if (typeof fn !== "function") continue;
      const args = sampleArgs[name] ?? [];
      await (fn as (...params: never[]) => Promise<unknown>)(...(args as never[]));
    }
    const missing = [...new Set(invoked)].filter((cmd) => !registered.has(cmd));
    expect(missing, `unregistered commands: ${missing.join(", ")}`).toEqual([]);
    expect(invoked.length).toBeGreaterThan(0);
    expect(invokedArgs.find((call) => call.cmd === "set_external_programs")?.args).toEqual({
      programs: sampleArgs.setExternalPrograms[0],
    });
    expect(invokedArgs.find((call) => call.cmd === "detect_external_programs")?.args).toBeUndefined();
    expect(invokedArgs.find((call) => call.cmd === "open_in_program")?.args).toEqual({
      fileId: 1,
      programId: "orca",
    });
  });

  it("getSettings and listTags call invoke with their command names and no payload", async () => {
    await api.getSettings();
    await api.listTags();
    expect(invokedArgs.filter((call) => call.cmd === "get_settings")).toEqual([
      { cmd: "get_settings", args: undefined },
    ]);
    expect(invokedArgs.filter((call) => call.cmd === "list_tags")).toEqual([
      { cmd: "list_tags", args: undefined },
    ]);
  });
});
