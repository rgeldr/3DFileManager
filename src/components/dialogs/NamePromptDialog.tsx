import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";

export function NamePromptDialog({ app }: { app: LibraryModel }) {
  const { namePrompt, setNamePrompt } = app;
  return (
    <>
      {namePrompt ? (
        <Modal>
          <form
            className="card"
            onSubmit={(event) => {
              event.preventDefault();
              const value = namePrompt.value.trim();
              if (value) namePrompt.onOk(value);
              setNamePrompt(null);
            }}
          >
            <h2>{namePrompt.title}</h2>
            <input value={namePrompt.value} onChange={(event) => setNamePrompt({ ...namePrompt, value: event.target.value })} autoFocus />
            <div className="row">
              <button type="button" onClick={() => setNamePrompt(null)}>Cancel</button>
              <button type="submit" className="primary">OK</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
