import { useEffect, useState } from "react";
import { api } from "../../api";
import type { LibraryModel } from "../../hooks/useLibrary";
import { tagChipStyle } from "../../lib/tagColor";
import type { TagColorChoice } from "../../types";
import { Modal } from "./Modal";

export function TagColorDialog({ app }: { app: LibraryModel }) {
  const { tagColorOpen, setTagColorOpen, setError, refreshLists } = app;
  const [rows, setRows] = useState<TagColorChoice[]>([]);

  useEffect(() => {
    if (!tagColorOpen) return;
    let cancelled = false;
    void api
      .listTagColors()
      .then((value) => {
        if (!cancelled) setRows(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tagColorOpen, setError]);

  const apply = (id: number, color: string | null) => {
    void api
      .setTagColor(id, color)
      .then(() => api.listTagColors())
      .then((value) => {
        setRows(value);
        return refreshLists();
      })
      .catch((err: unknown) => setError(String(err)));
  };

  return (
    <>
      {tagColorOpen ? (
        <Modal>
          <div className="card">
            <h2>Tag color</h2>
            <p className="muted">Pick a color for each tag, or restore its automatic color.</p>
            {rows.length === 0 ? <p>No tags yet.</p> : null}
            <div className="tag-color-list">
              {rows.map((tag) => (
                <div className="tag-color-row" key={tag.id}>
                  <span className="tag" style={tagChipStyle(tag.color)}>{tag.name}</span>
                  <input
                    type="color"
                    aria-label={`Color for ${tag.name}`}
                    value={tag.color}
                    onChange={(event) => apply(tag.id, event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!tag.custom}
                    aria-label={`Reset ${tag.name} to its automatic color`}
                    onClick={() => apply(tag.id, null)}
                  >
                    Automatic
                  </button>
                </div>
              ))}
            </div>
            <div className="row">
              <button type="button" onClick={() => setTagColorOpen(false)}>Close</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
