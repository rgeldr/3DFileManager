import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import type { ImportSummary } from "../../types";
import { ImportSummaryDialog } from "./ImportSummaryDialog";

const applyBulkMeta = vi.fn();

vi.mock("../../api", () => ({
  api: {
    applyBulkMeta: (...args: unknown[]) => applyBulkMeta(...args),
    recycleLastImport: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  applyBulkMeta.mockReset();
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
    tags: [],
    summary: summary(),
    setSummary: vi.fn(),
    importCreator: "Flexi Factory",
    setImportCreator: vi.fn(),
    importTags: [],
    setImportTags: vi.fn(),
    importTagText: "skeleton",
    setImportTagText: vi.fn(),
    setError: vi.fn(),
    refreshLists: vi.fn().mockResolvedValue(undefined),
    runDiskOp: vi.fn(),
    ...overrides,
  } as unknown as LibraryModel;
}

describe("Import summary", () => {
  it("applies a typed tag that was not confirmed with Enter", async () => {
    applyBulkMeta.mockResolvedValue(undefined);
    const model = app();
    render(<ImportSummaryDialog app={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep originals" }));
    expect(applyBulkMeta).toHaveBeenCalledWith([8, 9], "Flexi Factory", ["skeleton"]);
    await waitFor(() => expect(model.setSummary).toHaveBeenCalledWith(null));
    expect(model.refreshLists).toHaveBeenCalled();
  });
});
