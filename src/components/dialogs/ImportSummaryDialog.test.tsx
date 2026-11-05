import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import type { ImportSummary } from "../../types";
import { ImportSummaryDialog } from "./ImportSummaryDialog";

const applyBulkMeta = vi.fn();
const recycleLastImport = vi.fn();

vi.mock("../../api", () => ({
  api: {
    applyBulkMeta: (...args: unknown[]) => applyBulkMeta(...args),
    recycleLastImport: (...args: unknown[]) => recycleLastImport(...args),
  },
}));

afterEach(() => {
  cleanup();
  applyBulkMeta.mockReset();
  recycleLastImport.mockReset();
});

function summary(): ImportSummary {
  return {
    importedIds: [8, 9],
    importedCount: 2,
    duplicateCount: 0,
    unsupportedCount: 0,
    failed: [],
    recycleCount: 0,
    leftInPlace: 0,
    cancelled: false,
    pendingHashCount: 0,
  };
}

function app(overrides: Record<string, unknown> = {}): LibraryModel {
  return {
    creators: [],
    tags: ["FDM", "skeleton", "resin"],
    summary: summary(),
    setSummary: vi.fn(),
    importCreator: "Flexi Factory",
    setImportCreator: vi.fn(),
    importTags: ["FDM"],
    setImportTags: vi.fn(),
    importTagText: "fdm, skeleton",
    setImportTagText: vi.fn(),
    setError: vi.fn(),
    refreshLists: vi.fn().mockResolvedValue(undefined),
    runDiskOp: vi.fn(),
    ...overrides,
  } as unknown as LibraryModel;
}

describe("Import summary tags", () => {
  it("opens with the creator, chips, and pending comma text", () => {
    render(<ImportSummaryDialog app={app()} />);
    expect((screen.getByPlaceholderText("Creator for all imported files") as HTMLInputElement).value).toBe(
      "Flexi Factory",
    );
    expect(screen.getByRole("button", { name: /FDM/ })).toBeTruthy();
    expect((screen.getByPlaceholderText("Tags for all imported files") as HTMLInputElement).value).toBe(
      "fdm, skeleton",
    );
  });

  it("suggests the tag after the last comma", () => {
    render(<ImportSummaryDialog app={app({ importTagText: "FDM, ske", importTags: [] })} />);
    const options = document.querySelectorAll("#import-tags option");
    expect([...options].map((option) => option.getAttribute("value"))).toEqual(["FDM, skeleton"]);
  });

  it("adds each comma-separated tag on Enter and skips duplicates", () => {
    const model = app();
    render(<ImportSummaryDialog app={model} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Tags for all imported files"), { key: "Enter" });
    expect(model.setImportTags).toHaveBeenCalledWith(["FDM", "skeleton"]);
    expect(model.setImportTagText).toHaveBeenCalledWith("");
  });

  it("applies a typed tag that was not confirmed with Enter", async () => {
    applyBulkMeta.mockResolvedValue(undefined);
    const model = app({ importTags: [], importTagText: "skeleton" });
    render(<ImportSummaryDialog app={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep originals" }));
    expect(applyBulkMeta).toHaveBeenCalledWith([8, 9], "Flexi Factory", ["skeleton"]);
    await waitFor(() => expect(model.setSummary).toHaveBeenCalledWith(null));
    expect(model.refreshLists).toHaveBeenCalled();
  });

  it("applies a comma-separated tag still in the field", async () => {
    applyBulkMeta.mockResolvedValue(undefined);
    const model = app({ importTags: [], importTagText: "skeleton, resin" });
    render(<ImportSummaryDialog app={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep originals" }));
    expect(applyBulkMeta).toHaveBeenCalledWith([8, 9], "Flexi Factory", ["skeleton", "resin"]);
    await waitFor(() => expect(model.setSummary).toHaveBeenCalledWith(null));
    expect(model.refreshLists).toHaveBeenCalled();
  });

  it("does not call applyBulkMeta when creator and tags are blank", async () => {
    const model = app({ importCreator: "", importTags: [], importTagText: "" });
    render(<ImportSummaryDialog app={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep originals" }));
    expect(applyBulkMeta).not.toHaveBeenCalled();
    await waitFor(() => expect(model.setSummary).toHaveBeenCalledWith(null));
  });

  it("shows failed import paths in the summary", () => {
    render(
      <ImportSummaryDialog
        app={app({
          summary: {
            ...summary(),
            failed: ["bad.stl", "worse.obj"],
            pendingHashCount: 2,
          },
        })}
      />,
    );
    expect(screen.getByText(/bad.stl/)).toBeTruthy();
    expect(screen.getByText(/Duplicate checking continues/)).toBeTruthy();
  });

  it("shows Import stopped when the summary was cancelled", () => {
    render(<ImportSummaryDialog app={app({ summary: { ...summary(), cancelled: true } })} />);
    expect(screen.getByRole("heading", { name: "Import stopped" })).toBeTruthy();
  });

  it("omits bulk meta fields when nothing was imported", () => {
    render(
      <ImportSummaryDialog
        app={app({
          summary: { ...summary(), importedIds: [], importedCount: 0 },
        })}
      />,
    );
    expect(screen.queryByPlaceholderText("Creator for all imported files")).toBeNull();
  });

  it("runs recycle through runDiskOp when originals should be removed", async () => {
    recycleLastImport.mockResolvedValue({ cancelled: false, failed: [] });
    const runDiskOp = vi.fn(async (opts: { run: () => Promise<unknown> }) => {
      await opts.run();
    });
    const model = app({
      summary: { ...summary(), recycleCount: 2 },
      runDiskOp,
    });
    render(<ImportSummaryDialog app={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo import of 2 files (Recycle Bin)" }));
    await waitFor(() => expect(runDiskOp).toHaveBeenCalled());
    expect(recycleLastImport).toHaveBeenCalled();
    expect(model.setSummary).toHaveBeenCalledWith(null);
  });

  it("surfaces applyBulkMeta failures without closing the summary", async () => {
    applyBulkMeta.mockRejectedValue(new Error("bulk failed"));
    const model = app();
    render(<ImportSummaryDialog app={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep originals" }));
    await waitFor(() => expect(model.setError).toHaveBeenCalledWith(expect.stringContaining("bulk failed")));
    expect(model.setSummary).not.toHaveBeenCalled();
  });
});
