import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../../api";
import type { LibraryModel } from "../../hooks/useLibrary";
import { normalizeProgramPath, sameProgramPath } from "../../lib/programPath";
import type { ExternalProgram, ProgramSuggestion } from "../../types";
import { Modal } from "./Modal";

async function pickExecutable(): Promise<string | null> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Programs", extensions: ["exe"] }],
  });
  return typeof picked === "string" ? picked : null;
}

function suggestionTaken(suggestion: ProgramSuggestion, programs: ExternalProgram[]): boolean {
  const detected = suggestion.path;
  if (detected) return programs.some((program) => sameProgramPath(program.path, detected));
  return programs.some((program) => program.name.toLowerCase() === suggestion.name.toLowerCase());
}

export function ExternalProgramsDialog({ app }: { app: LibraryModel }) {
  const { externalProgramsOpen, setExternalProgramsOpen, setError, setSettings } = app;
  const [programs, setPrograms] = useState<ExternalProgram[]>([]);
  const [suggestions, setSuggestions] = useState<ProgramSuggestion[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftPath, setDraftPath] = useState("");
  const saved = useRef<ExternalProgram[]>([]);
  const programsRef = useRef(programs);
  const settingsRef = useRef(app.settings);
  programsRef.current = programs;
  settingsRef.current = app.settings;

  useEffect(() => {
    if (!externalProgramsOpen) return;
    const initial = settingsRef.current?.externalPrograms ?? [];
    saved.current = initial;
    setPrograms(initial);
    setDraftName("");
    setDraftPath("");
    setSuggestions([]);
    let cancelled = false;
    void api
      .detectExternalPrograms()
      .then((value) => {
        if (!cancelled) setSuggestions(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [externalProgramsOpen, setError]);

  const persist = async (next: ExternalProgram[]): Promise<boolean> => {
    const cleaned = next.map((program) => ({
      ...program,
      name: program.name.trim(),
      path: normalizeProgramPath(program.path),
    }));
    if (cleaned.some((program) => !program.name || !program.path)) {
      setError("Enter a name and the full path to an .exe file.");
      setPrograms(saved.current);
      programsRef.current = saved.current;
      return false;
    }
    if (JSON.stringify(cleaned) === JSON.stringify(saved.current)) {
      setPrograms(cleaned);
      programsRef.current = cleaned;
      return true;
    }
    setPrograms(cleaned);
    programsRef.current = cleaned;
    try {
      await api.setExternalPrograms(cleaned);
      saved.current = cleaned;
      setSettings((current) => (current ? { ...current, externalPrograms: cleaned } : current));
      return true;
    } catch (err) {
      setError(String(err));
      setPrograms(saved.current);
      programsRef.current = saved.current;
      return false;
    }
  };

  const addProgram = (name: string, path: string) => {
    const trimmedPath = normalizeProgramPath(path);
    if (programsRef.current.some((program) => sameProgramPath(program.path, trimmedPath))) {
      return Promise.resolve(false);
    }
    return persist([
      ...programsRef.current,
      { id: crypto.randomUUID(), name, path },
    ]);
  };

  return (
    <>
      {externalProgramsOpen ? (
        <Modal>
          <div className="card card-programs">
            <h2>External programs</h2>
            <p className="muted">
              Add a slicer or other program. Open in… on a file starts that program with the file.
            </p>
            <div className="program-add">
              <input
                aria-label="Program name"
                placeholder="Name"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
              <input
                aria-label="Program path"
                placeholder="Path to the .exe"
                value={draftPath}
                onChange={(event) => setDraftPath(event.target.value)}
              />
              <div className="program-actions">
                <button
                  type="button"
                  onClick={() => {
                    void pickExecutable().then((picked) => {
                      if (picked) setDraftPath(picked);
                    });
                  }}
                >
                  Browse…
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!draftName.trim() || !draftPath.trim()}
                  onClick={() => {
                    const name = draftName;
                    const path = draftPath;
                    void addProgram(name, path).then((savedProgram) => {
                      if (savedProgram) {
                        setDraftName("");
                        setDraftPath("");
                      }
                    });
                  }}
                >
                  Add
                </button>
              </div>
            </div>
            {suggestions.length > 0 ? (
              <div className="program-suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.name}
                    type="button"
                    disabled={suggestionTaken(suggestion, programs)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (suggestion.path) {
                        addProgram(suggestion.name, suggestion.path);
                        return;
                      }
                      void pickExecutable().then((picked) => {
                        if (picked) addProgram(suggestion.name, picked);
                      });
                    }}
                  >
                    {suggestion.path ? `Add ${suggestion.name}` : `Add ${suggestion.name}…`}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="program-list">
              {programs.length === 0 ? <p className="muted">No programs yet.</p> : null}
              {programs.map((program, index) => (
                <div className="program-row" key={program.id}>
                  <div className="program-row-main">
                    <input
                      aria-label={`Name for ${program.name}`}
                      value={program.name}
                      onChange={(event) => {
                        const name = event.target.value;
                        setPrograms((current) =>
                          current.map((item) => (item.id === program.id ? { ...item, name } : item)),
                        );
                      }}
                      onBlur={() => {
                        void persist(programsRef.current);
                      }}
                    />
                    <input
                      aria-label={`Path for ${program.name}`}
                      value={program.path}
                      onChange={(event) => {
                        const path = event.target.value;
                        setPrograms((current) =>
                          current.map((item) => (item.id === program.id ? { ...item, path } : item)),
                        );
                      }}
                      onBlur={() => {
                        void persist(programsRef.current);
                      }}
                    />
                  </div>
                  <div className="program-actions">
                    <button
                      type="button"
                      aria-label={`Browse for ${program.name}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        void pickExecutable().then((picked) => {
                          if (!picked) return;
                          const next = programsRef.current.map((item) =>
                            item.id === program.id ? { ...item, path: picked } : item,
                          );
                          void persist(next);
                        });
                      }}
                    >
                      Browse…
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${program.name} up`}
                      disabled={index === 0}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (index === 0) return;
                        const next = programsRef.current.slice();
                        const [item] = next.splice(index, 1);
                        next.splice(index - 1, 0, item);
                        void persist(next);
                      }}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${program.name} down`}
                      disabled={index === programs.length - 1}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (index === programs.length - 1) return;
                        const next = programsRef.current.slice();
                        const [item] = next.splice(index, 1);
                        next.splice(index + 1, 0, item);
                        void persist(next);
                      }}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${program.name}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        void persist(programsRef.current.filter((item) => item.id !== program.id));
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="row">
              <button type="button" onClick={() => setExternalProgramsOpen(false)}>Close</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
