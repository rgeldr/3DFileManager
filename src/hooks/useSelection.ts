import { useState } from "react";
import type { FileRow } from "../types";

export function useSelection(
  files: FileRow[],
  prefetchRef: { current: (ids: number[]) => void },
) {
  const [selected, setSelected] = useState<number[]>([]);
  const selectedFile = files.find((file) => selected.length === 1 && file.id === selected[0]) ?? null;
  const onSelect = (id: number, mode: "replace" | "toggle" | "range") => {
    if (mode === "toggle") {
      const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
      setSelected(next);
      prefetchRef.current(next);
      return;
    }
    if (mode === "range" && selected.length > 0) {
      const ids = files.map((file) => file.id);
      const start = ids.indexOf(selected[selected.length - 1]);
      const end = ids.indexOf(id);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        const next = ids.slice(from, to + 1);
        setSelected(next);
        prefetchRef.current(next);
        return;
      }
    }
    setSelected([id]);
    prefetchRef.current([id]);
  };

  return { selected, setSelected, onSelect, selectedFile };
}
