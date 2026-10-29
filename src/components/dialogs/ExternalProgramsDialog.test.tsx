import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import type { ExternalProgram, ProgramSuggestion } from "../../types";
import { ExternalProgramsDialog, pickExecutable, suggestionTaken } from "./ExternalProgramsDialog";

const setExternalPrograms = vi.fn<(programs: ExternalProgram[]) => Promise<void>>();
const detectExternalPrograms = vi.fn<() => Promise<ProgramSuggestion[]>>();
const openDialog = vi.fn<(options: unknown) => Promise<string | null>>();

vi.mock("../../api", () => ({
  api: {
    setExternalPrograms: (programs: ExternalProgram[]) => setExternalPrograms(programs),
    detectExternalPrograms: () => detectExternalPrograms(),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (options: unknown) => openDialog(options),
}));

afterEach(() => {
  cleanup();
  setExternalPrograms.mockReset();
  setExternalPrograms.mockResolvedValue(undefined);
  detectExternalPrograms.mockReset();
  detectExternalPrograms.mockResolvedValue([]);
  openDialog.mockReset();
  openDialog.mockResolvedValue(null);
});

const saved: ExternalProgram[] = [
  { id: "orca", name: "OrcaSlicer", path: "C:\\Program Files\\OrcaSlicer\\orca-slicer.exe" },
  { id: "bambu", name: "Bambu Studio", path: "C:\\Program Files\\Bambu Studio\\bambu-studio.exe" },
];

function app(programs: ExternalProgram[] = saved) {
  const calls = {
    setExternalProgramsOpen: vi.fn(),
    setError: vi.fn(),
    setSettings: vi.fn(),
  };
  const model = {
    externalProgramsOpen: true,
    settings: { externalPrograms: programs },
    ...calls,
  } as unknown as LibraryModel;
  return { model, calls };
}

describe("pickExecutable", () => {
  it("returns a chosen exe path and ignores a cancel or a multi-select", async () => {
    openDialog.mockResolvedValueOnce("D:\\Tools\\orca-slicer.exe");
    await expect(pickExecutable()).resolves.toBe("D:\\Tools\\orca-slicer.exe");
    expect(openDialog).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: "Programs", extensions: ["exe"] }],
    });
    openDialog.mockResolvedValueOnce(null);
    await expect(pickExecutable()).resolves.toBeNull();
    openDialog.mockResolvedValueOnce(["D:\\Tools\\orca-slicer.exe"] as unknown as string);
    await expect(pickExecutable()).resolves.toBeNull();
  });
});

describe("suggestionTaken", () => {
  it("matches a detected path, or the name when detection found no path", () => {
    const programs: ExternalProgram[] = [
      { id: "orca", name: "OrcaSlicer", path: "C:\\Program Files\\OrcaSlicer\\orca-slicer.exe" },
    ];
    expect(
      suggestionTaken({ name: "OrcaSlicer", path: "C:/Program Files/OrcaSlicer/orca-slicer.exe" }, programs),
    ).toBe(true);
    expect(suggestionTaken({ name: "PrusaSlicer", path: "C:\\Prusa\\prusa-slicer.exe" }, programs)).toBe(false);
    expect(
      suggestionTaken({ name: "Bambu Studio", path: null }, [{ id: "b", name: "bambu studio", path: "" }]),
    ).toBe(true);
    expect(suggestionTaken({ name: "Bambu Studio", path: null }, programs)).toBe(false);
  });
});

describe("External programs dialog", () => {
  it("adds a detected program and saves the list", async () => {
    detectExternalPrograms.mockResolvedValue([
      { name: "OrcaSlicer", path: "C:\\Program Files\\OrcaSlicer\\orca-slicer.exe" },
      { name: "PrusaSlicer", path: "C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer.exe" },
      { name: "Bambu Studio", path: null },
    ]);
    const { model, calls } = app([]);
    render(<ExternalProgramsDialog app={model} />);
    const addPrusa = await screen.findByRole("button", { name: "Add PrusaSlicer" });
    fireEvent.mouseDown(addPrusa);
    fireEvent.click(addPrusa);
    await waitFor(() => expect(setExternalPrograms).toHaveBeenCalled());
    const savedPrograms = setExternalPrograms.mock.calls[0][0] as ExternalProgram[];
    expect(savedPrograms).toHaveLength(1);
    expect(savedPrograms[0].name).toBe("PrusaSlicer");
    expect(savedPrograms[0].path).toBe("C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer.exe");
    expect(savedPrograms[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls.setSettings).toHaveBeenCalledWith(expect.any(Function));
    expect(screen.getByRole("button", { name: "Add OrcaSlicer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Bambu Studio…" })).toBeTruthy();
  });

  it("uses the file picker for a suggestion that was not found", async () => {
    detectExternalPrograms.mockResolvedValue([{ name: "Bambu Studio", path: null }]);
    openDialog.mockResolvedValue("D:\\Tools\\Bambu Studio\\bambu-studio.exe");
    const { model } = app([]);
    render(<ExternalProgramsDialog app={model} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Bambu Studio…" }));
    await waitFor(() => expect(setExternalPrograms).toHaveBeenCalled());
    expect(openDialog).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: "Programs", extensions: ["exe"] }],
    });
    const savedPrograms = setExternalPrograms.mock.calls[0][0] as ExternalProgram[];
    expect(savedPrograms[0].name).toBe("Bambu Studio");
    expect(savedPrograms[0].path).toBe("D:\\Tools\\Bambu Studio\\bambu-studio.exe");
  });

  it("removes a program and reorders the rest", async () => {
    const { model, calls } = app();
    render(<ExternalProgramsDialog app={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Move OrcaSlicer down" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Move OrcaSlicer down" })).toHaveProperty("disabled", true);
    });
    const reordered = setExternalPrograms.mock.calls[0][0] as ExternalProgram[];
    expect(reordered.map((program) => program.id)).toEqual(["bambu", "orca"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Bambu Studio" }));
    await waitFor(() => expect(setExternalPrograms).toHaveBeenCalledTimes(2));
    const remaining = setExternalPrograms.mock.calls[1][0] as ExternalProgram[];
    expect(remaining.map((program) => program.id)).toEqual(["orca"]);
    expect(calls.setError).not.toHaveBeenCalled();
  });

  it("saves an edited name and a browsed path", async () => {
    openDialog.mockResolvedValue("C:\\Apps\\Orca Slicer\\orca-slicer.exe");
    const { model } = app();
    render(<ExternalProgramsDialog app={model} />);
    const name = screen.getByLabelText("Name for OrcaSlicer") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "  Orca  " } });
    fireEvent.blur(name);
    await waitFor(() => expect(setExternalPrograms).toHaveBeenCalled());
    expect((setExternalPrograms.mock.calls[0][0] as ExternalProgram[])[0].name).toBe("Orca");

    const browse = await screen.findByRole("button", { name: "Browse for Orca" });
    fireEvent.mouseDown(browse);
    fireEvent.click(browse);
    await waitFor(() => expect(setExternalPrograms).toHaveBeenCalledTimes(2));
    expect((setExternalPrograms.mock.calls[1][0] as ExternalProgram[])[0].path).toBe(
      "C:\\Apps\\Orca Slicer\\orca-slicer.exe",
    );
  });

  it("adds a typed name and path", async () => {
    const { model } = app([]);
    render(<ExternalProgramsDialog app={model} />);
    expect(screen.getByRole("button", { name: "Add" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Program name"), { target: { value: "PrusaSlicer" } });
    fireEvent.change(screen.getByLabelText("Program path"), {
      target: { value: "C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer.exe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(setExternalPrograms).toHaveBeenCalled());
    const savedPrograms = setExternalPrograms.mock.calls[0][0] as ExternalProgram[];
    expect(savedPrograms[0].name).toBe("PrusaSlicer");
    expect(savedPrograms[0].path).toContain("prusa-slicer.exe");
  });

  it("shows a save error and keeps the previous list", async () => {
    setExternalPrograms.mockRejectedValue("Choose the full path to an .exe file.");
    const { model, calls } = app();
    render(<ExternalProgramsDialog app={model} />);
    const path = screen.getByLabelText("Path for OrcaSlicer") as HTMLInputElement;
    fireEvent.change(path, { target: { value: "C:\\not-an-exe.txt" } });
    fireEvent.blur(path);
    await waitFor(() => expect(calls.setError).toHaveBeenCalledWith("Choose the full path to an .exe file."));
    expect(screen.getByLabelText("Path for OrcaSlicer")).toHaveProperty(
      "value",
      "C:\\Program Files\\OrcaSlicer\\orca-slicer.exe",
    );
  });

  it("moves a program up and disables the ends of the list", async () => {
    const { model } = app();
    render(<ExternalProgramsDialog app={model} />);
    expect(screen.getByRole("button", { name: "Move OrcaSlicer up" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Move Bambu Studio down" })).toHaveProperty("disabled", true);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Move OrcaSlicer up" }));
    fireEvent.click(screen.getByRole("button", { name: "Move OrcaSlicer up" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Move Bambu Studio down" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Bambu Studio down" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Move Bambu Studio up" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Bambu Studio up" }));
    await waitFor(() => expect(setExternalPrograms).toHaveBeenCalled());
    expect((setExternalPrograms.mock.calls[0][0] as ExternalProgram[]).map((program) => program.id)).toEqual([
      "bambu",
      "orca",
    ]);
  });

  it("does not save a blank name or an unchanged edit", async () => {
    const { model, calls } = app();
    render(<ExternalProgramsDialog app={model} />);
    const name = screen.getByLabelText("Name for OrcaSlicer");
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.blur(name);
    await waitFor(() => {
      expect(calls.setError).toHaveBeenCalledWith("Enter a name and the full path to an .exe file.");
      expect(screen.getByLabelText("Name for OrcaSlicer")).toHaveProperty("value", "OrcaSlicer");
    });
    expect(setExternalPrograms).not.toHaveBeenCalled();

    const restored = screen.getByLabelText("Name for OrcaSlicer");
    fireEvent.change(restored, { target: { value: "  OrcaSlicer  " } });
    fireEvent.blur(restored);
    await waitFor(() => {
      expect(screen.getByLabelText("Name for OrcaSlicer")).toHaveProperty("value", "OrcaSlicer");
    });
    expect(setExternalPrograms).not.toHaveBeenCalled();
  });

  it("disables a suggestion when only the separators differ", async () => {
    detectExternalPrograms.mockResolvedValue([
      { name: "OrcaSlicer", path: "C:/Program Files/OrcaSlicer/orca-slicer.exe" },
    ]);
    const { model } = app();
    render(<ExternalProgramsDialog app={model} />);
    expect(await screen.findByRole("button", { name: "Add OrcaSlicer" })).toHaveProperty("disabled", true);
  });

  it("treats a mixed-separator path as the program already listed", async () => {
    const { model } = app([saved[0]]);
    render(<ExternalProgramsDialog app={model} />);
    fireEvent.change(screen.getByLabelText("Program name"), { target: { value: "Orca again" } });
    fireEvent.change(screen.getByLabelText("Program path"), {
      target: { value: "C:/Program Files/OrcaSlicer/orca-slicer.exe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(setExternalPrograms).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Program name")).toHaveProperty("value", "Orca again");
  });

  it("saves a pasted path with windows separators", async () => {
    const { model } = app([]);
    render(<ExternalProgramsDialog app={model} />);
    fireEvent.change(screen.getByLabelText("Program name"), { target: { value: "CHITUBOX" } });
    fireEvent.change(screen.getByLabelText("Program path"), {
      target: { value: "C:\\Program Files\\CHITUBOX/CHITUBOX.exe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(setExternalPrograms).toHaveBeenCalled());
    expect((setExternalPrograms.mock.calls[0][0] as ExternalProgram[])[0].path).toBe(
      "C:\\Program Files\\CHITUBOX\\CHITUBOX.exe",
    );
  });

  it("saves a typed path edit", async () => {
    const { model } = app();
    render(<ExternalProgramsDialog app={model} />);
    const path = screen.getByLabelText("Path for Bambu Studio");
    fireEvent.change(path, { target: { value: "D:\\Tools\\bambu-studio.exe" } });
    fireEvent.blur(path);
    await waitFor(() => expect(setExternalPrograms).toHaveBeenCalled());
    expect((setExternalPrograms.mock.calls[0][0] as ExternalProgram[])[1].path).toBe("D:\\Tools\\bambu-studio.exe");
  });

  it("keeps the draft when add is rejected or the path is already listed", async () => {
    setExternalPrograms.mockRejectedValue("Choose the full path to an .exe file.");
    const { model, calls } = app([]);
    render(<ExternalProgramsDialog app={model} />);
    fireEvent.change(screen.getByLabelText("Program name"), { target: { value: "PrusaSlicer" } });
    fireEvent.change(screen.getByLabelText("Program path"), { target: { value: "not-an-exe" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(calls.setError).toHaveBeenCalledWith("Choose the full path to an .exe file."));
    expect(screen.getByLabelText("Program name")).toHaveProperty("value", "PrusaSlicer");
    expect(screen.getByText("No programs yet.")).toBeTruthy();

    calls.setError.mockClear();
    setExternalPrograms.mockReset();
    setExternalPrograms.mockResolvedValue(undefined);
    const path = "C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer.exe";
    fireEvent.change(screen.getByLabelText("Program path"), { target: { value: path } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByLabelText("Program name")).toHaveProperty("value", ""));
    expect(setExternalPrograms).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Program name"), { target: { value: "Prusa again" } });
    fireEvent.change(screen.getByLabelText("Program path"), { target: { value: path } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(setExternalPrograms).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Program name")).toHaveProperty("value", "Prusa again");
  });

  it("leaves a saved path alone when its Browse picker is cancelled", async () => {
    openDialog.mockResolvedValue(null);
    const { model } = app();
    render(<ExternalProgramsDialog app={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Browse for OrcaSlicer" }));
    await waitFor(() => expect(openDialog).toHaveBeenCalled());
    expect(setExternalPrograms).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Path for OrcaSlicer")).toHaveProperty(
      "value",
      "C:\\Program Files\\OrcaSlicer\\orca-slicer.exe",
    );
  });

  it("fills the draft from Browse and ignores a cancelled picker", async () => {
    openDialog.mockResolvedValueOnce(null).mockResolvedValueOnce("E:\\Apps\\cura.exe");
    const { model } = app([]);
    render(<ExternalProgramsDialog app={model} />);
    fireEvent.click(screen.getByRole("button", { name: "Browse…" }));
    await waitFor(() => expect(openDialog).toHaveBeenCalled());
    expect(screen.getByLabelText("Program path")).toHaveProperty("value", "");
    fireEvent.click(screen.getByRole("button", { name: "Browse…" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Program path")).toHaveProperty("value", "E:\\Apps\\cura.exe");
    });
    expect(setExternalPrograms).not.toHaveBeenCalled();
  });

  it("disables a suggestion that is already listed and ignores a cancelled picker", async () => {
    detectExternalPrograms.mockResolvedValue([
      { name: "OrcaSlicer", path: "C:\\Program Files\\OrcaSlicer\\orca-slicer.exe" },
      { name: "Bambu Studio", path: null },
    ]);
    openDialog.mockResolvedValue(null);
    const { model } = app();
    render(<ExternalProgramsDialog app={model} />);
    const orca = await screen.findByRole("button", { name: "Add OrcaSlicer" });
    const bambu = await screen.findByRole("button", { name: "Add Bambu Studio…" });
    expect(orca).toHaveProperty("disabled", true);
    expect(bambu).toHaveProperty("disabled", true);
    fireEvent.click(bambu);
    expect(openDialog).not.toHaveBeenCalled();
    expect(setExternalPrograms).not.toHaveBeenCalled();
  });

  it("does not add a suggestion when the picker is cancelled", async () => {
    detectExternalPrograms.mockResolvedValue([{ name: "Bambu Studio", path: null }]);
    openDialog.mockResolvedValue(null);
    const { model } = app([]);
    render(<ExternalProgramsDialog app={model} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add Bambu Studio…" }));
    await waitFor(() => expect(openDialog).toHaveBeenCalled());
    expect(setExternalPrograms).not.toHaveBeenCalled();
    expect(screen.getByText("No programs yet.")).toBeTruthy();
  });

  it("reports a detection failure and closes", async () => {
    detectExternalPrograms.mockRejectedValue(new Error("detect failed"));
    const { model, calls } = app([]);
    render(<ExternalProgramsDialog app={model} />);
    await waitFor(() => expect(calls.setError).toHaveBeenCalledWith("Error: detect failed"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(calls.setExternalProgramsOpen).toHaveBeenCalledWith(false);
  });

  it("renders nothing while the dialog is closed", () => {
    const { model } = app();
    model.externalProgramsOpen = false;
    render(<ExternalProgramsDialog app={model} />);
    expect(screen.queryByRole("heading", { name: "External programs" })).toBeNull();
    expect(detectExternalPrograms).not.toHaveBeenCalled();
  });

  it("writes the saved list into settings and ignores a missing settings object", async () => {
    const { model, calls } = app([]);
    render(<ExternalProgramsDialog app={model} />);
    fireEvent.change(screen.getByLabelText("Program name"), { target: { value: "Cura" } });
    fireEvent.change(screen.getByLabelText("Program path"), { target: { value: "C:\\Cura\\Cura.exe" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(calls.setSettings).toHaveBeenCalled());
    const update = calls.setSettings.mock.calls[0][0] as (current: { externalPrograms: ExternalProgram[] } | null) => unknown;
    const next = update({ externalPrograms: [] }) as { externalPrograms: ExternalProgram[] };
    expect(next.externalPrograms[0].name).toBe("Cura");
    expect(update(null)).toBeNull();
  });

  it("removes the last program", async () => {
    const { model } = app([saved[0]]);
    render(<ExternalProgramsDialog app={model} />);
    const remove = screen.getByRole("button", { name: "Remove OrcaSlicer" });
    fireEvent.mouseDown(remove);
    fireEvent.click(remove);
    await waitFor(() => expect(setExternalPrograms).toHaveBeenCalled());
    expect(setExternalPrograms.mock.calls[0][0]).toEqual([]);
    expect(screen.getByText("No programs yet.")).toBeTruthy();
  });
});
