import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FileRow } from "../types";
import { useSelection } from "./useSelection";

const files: FileRow[] = [
  { id: 1, sortName: "a" } as FileRow,
  { id: 2, sortName: "b" } as FileRow,
  { id: 3, sortName: "c" } as FileRow,
];

describe("useSelection", () => {
  it("replace selects one id and exposes selectedFile", () => {
    const prefetch = vi.fn();
    const { result } = renderHook(() => useSelection(files, { current: prefetch }));
    act(() => result.current.onSelect(2, "replace"));
    expect(result.current.selected).toEqual([2]);
    expect(result.current.selectedFile?.sortName).toBe("b");
    expect(prefetch).toHaveBeenLastCalledWith([2]);
  });

  it("toggle adds and removes ids", () => {
    const prefetch = vi.fn();
    const { result } = renderHook(() => useSelection(files, { current: prefetch }));
    act(() => result.current.onSelect(1, "replace"));
    act(() => result.current.onSelect(3, "toggle"));
    expect(result.current.selected).toEqual([1, 3]);
    act(() => result.current.onSelect(1, "toggle"));
    expect(result.current.selected).toEqual([3]);
    expect(prefetch).toHaveBeenLastCalledWith([3]);
  });

  it("range selects the inclusive slice in file order", () => {
    const prefetch = vi.fn();
    const { result } = renderHook(() => useSelection(files, { current: prefetch }));
    act(() => result.current.onSelect(1, "replace"));
    act(() => result.current.onSelect(3, "range"));
    expect(result.current.selected).toEqual([1, 2, 3]);
    act(() => result.current.onSelect(1, "replace"));
    act(() => result.current.onSelect(3, "range"));
    expect(result.current.selected).toEqual([1, 2, 3]);
    act(() => result.current.onSelect(3, "replace"));
    act(() => result.current.onSelect(1, "range"));
    expect(result.current.selected).toEqual([1, 2, 3]);
  });

  it("range with no anchor falls back to replace", () => {
    const prefetch = vi.fn();
    const { result } = renderHook(() => useSelection(files, { current: prefetch }));
    act(() => result.current.onSelect(2, "range"));
    expect(result.current.selected).toEqual([2]);
  });

  it("selectedFile is null for zero or multiple selections", () => {
    const { result } = renderHook(() => useSelection(files, { current: vi.fn() }));
    expect(result.current.selectedFile).toBeNull();
    act(() => result.current.onSelect(1, "toggle"));
    act(() => result.current.onSelect(2, "toggle"));
    expect(result.current.selectedFile).toBeNull();
  });
});
