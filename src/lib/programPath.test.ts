import { describe, expect, it } from "vitest";
import { normalizeProgramPath, sameProgramPath } from "./programPath";

describe("program paths", () => {
  it("rewrites mixed separators on drive and UNC paths", () => {
    expect(normalizeProgramPath(r("C:\\Program Files\\CHITUBOX/CHITUBOX.exe"))).toBe(
      r("C:\\Program Files\\CHITUBOX\\CHITUBOX.exe"),
    );
    expect(normalizeProgramPath("C:/Program Files/OrcaSlicer/orca-slicer.exe")).toBe(
      r("C:\\Program Files\\OrcaSlicer\\orca-slicer.exe"),
    );
    expect(normalizeProgramPath(r("\\\\server\\share/Orca/orca-slicer.exe"))).toBe(
      r("\\\\server\\share\\Orca\\orca-slicer.exe"),
    );
    expect(normalizeProgramPath("//server/share/app.exe")).toBe(r("\\\\server\\share\\app.exe"));
    expect(normalizeProgramPath("  D:/Tools/bambu-studio.exe  ")).toBe(r("D:\\Tools\\bambu-studio.exe"));
    expect(normalizeProgramPath("C://Program Files//Orca/orca-slicer.exe")).toBe(
      r("C:\\Program Files\\Orca\\orca-slicer.exe"),
    );
  });

  it("leaves a non-windows path unchanged", () => {
    expect(normalizeProgramPath("/tmp/orca-slicer.exe")).toBe("/tmp/orca-slicer.exe");
  });

  it("treats mixed and native separators as the same path", () => {
    expect(
      sameProgramPath(
        r("C:\\Program Files\\CHITUBOX\\CHITUBOX.exe"),
        r("C:\\Program Files\\CHITUBOX/CHITUBOX.exe"),
      ),
    ).toBe(true);
    expect(sameProgramPath("//server/share/app.exe", r("\\\\server\\share\\app.exe"))).toBe(true);
    expect(sameProgramPath("/tmp/a.exe", "/tmp/b.exe")).toBe(false);
  });
});

function r(value: string): string {
  return value;
}
