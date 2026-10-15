import type { LibraryModel } from "../../hooks/useLibrary";

export function Toast({ app }: { app: LibraryModel }) {
  const { toast } = app;
  return (
    <>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}
