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
    expect(screen.queryByRole("button", { name: "Move to Recycle Bin" })).toBeNull();
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

  it("names the recycle button Move to Recycle Bin and still recycles originals", async () => {
    recycleLastImport.mockResolvedValue({ cancelled: false, failed: [] });
    const runDiskOp = vi.fn(async (opts: { title: string; success: string; cancelled: string; run: () => Promise<unknown> }) => {
      await opts.run();
    });
    const model = app({
      summary: { ...summary(), recycleCount: 2 },
      runDiskOp,
    });
    const { rerender } = render(<ImportSummaryDialog app={model} />);
    expect(screen.getByText("Keep those originals, or move the imported files and duplicates to the Recycle Bin?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Undo import/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Move to Recycle Bin" }));
    await waitFor(() => expect(runDiskOp).toHaveBeenCalled());
    expect(runDiskOp).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Moving originals to the Recycle Bin...",
        success: "Originals moved to the Recycle Bin",
        cancelled: "Recycle cancelled",
      }),
    );
    expect(recycleLastImport).toHaveBeenCalled();
    expect(model.setSummary).toHaveBeenCalledWith(null);

    rerender(
      <ImportSummaryDialog
        app={app({
          summary: { ...summary(), recycleCount: 1 },
          runDiskOp,
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Move to Recycle Bin" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Undo import/ })).toBeNull();
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
