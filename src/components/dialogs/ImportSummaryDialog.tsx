import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { api } from "../../api";
import { appendCommaTags, commaTagOptions, tagFieldKey } from "../../lib/commaTags";
import { importMetaPayload } from "../../lib/importMeta";
import { displayTagColor } from "../../lib/tagColor";
import { TagChip } from "../TagChip";

export function ImportSummaryDialog({ app }: { app: LibraryModel }) {
  const { creators, tags, tagCounts = [], summary, setSummary, importCreator, setImportCreator, importTags, setImportTags, importTagText, setImportTagText, setError, refreshLists, runDiskOp } = app;
  return (
    <>
      {summary ? (
        <Modal>
          <div className="card">
            <h2>{summary.cancelled ? "Import stopped" : "Import finished"}</h2>
            <p>
              Imported {summary.importedCount}. Duplicates {summary.duplicateCount}. Left in place {summary.leftInPlace}.
            </p>
            <p className="muted">
              Unsupported files will be left in place. Files that failed to import stay in the original folder too.
            </p>
            {summary.pendingHashCount > 0 ? (
              <p>Duplicate checking continues in the background for {summary.pendingHashCount} files.</p>
            ) : null}
            {summary.failed.length > 0 ? <p>{summary.failed.slice(0, 5).join(" ")}</p> : null}
            {summary.importedIds.length > 0 ? (
              <>
                <p className="muted">Applies to newly imported files only.</p>
                <input
                  placeholder="Creator for all imported files"
                  list="import-creators"
                  value={importCreator}
                  onChange={(event) => setImportCreator(event.target.value)}
                />
                <datalist id="import-creators">
                  {creators.map((item) => <option key={item} value={item} />)}
                </datalist>
                <div className="tags">
                  {importTags.map((item) => (
                    <TagChip
                      key={item}
                      name={item}
                      color={displayTagColor(item, tagCounts)}
                      onClick={() => setImportTags(importTags.filter((tag) => tag !== item))}
                    />
                  ))}
                </div>
                <input
                  placeholder="Tags for all imported files"
                  list="import-tags"
                  value={importTagText}
                  onChange={(event) => setImportTagText(event.target.value)}
                  onKeyDown={(event) => {
                    const next = tagFieldKey(importTags, importTagText, event.key);
                    if (!next) return;
                    event.preventDefault();
                    setImportTags(next.tags);
                    setImportTagText(next.text);
                  }}
                />
                <datalist id="import-tags">
                  {commaTagOptions(importTagText, tags).map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </>
            ) : null}
            {summary.recycleCount > 0 ? (
              <p>Keep those originals, or move the imported files and duplicates to the Recycle Bin?</p>
            ) : null}
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const ids = summary.importedIds;
                  void (async () => {
                    try {
                      const payload = importMetaPayload(ids, importCreator, appendCommaTags(importTags, importTagText));
                      if (payload) {
                        await api.applyBulkMeta(payload.ids, payload.creator, payload.tags);
                        await refreshLists();
                      }
                      setSummary(null);
                    } catch (err) {
                      setError(String(err));
                    }
                  })();
                }}
              >
                Keep originals
              </button>
              {summary.recycleCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const ids = summary.importedIds;
                    void (async () => {
                      try {
                        const payload = importMetaPayload(ids, importCreator, appendCommaTags(importTags, importTagText));
                        if (payload) {
                          await api.applyBulkMeta(payload.ids, payload.creator, payload.tags);
                          await refreshLists();
                        }
                        setSummary(null);
                        void runDiskOp({
                          title: "Moving originals to the Recycle Bin...",
                          cancellable: true,
                          success: "Originals moved to the Recycle Bin",
                          cancelled: "Recycle cancelled",
                          run: async () => {
                            const outcome = await api.recycleLastImport();
                            if (!outcome.cancelled && outcome.failed.length > 0) {
                              throw new Error(outcome.failed.join("\n"));
                            }
                            return outcome;
                          },
                        });
                      } catch (err) {
                        setError(String(err));
                      }
                    })();
                  }}
                >
                  Move to Recycle Bin
                </button>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
