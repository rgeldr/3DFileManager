import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportMetaFields } from "./ImportMetaFields";

afterEach(() => cleanup());

describe("ImportMetaFields", () => {
  it("shows the shared creator, chip, pending text, and comma suggestion", () => {
    const setImportTags = vi.fn();
    render(
      <ImportMetaFields
        creators={["Ada"]}
        tags={["PLA", "benchy"]}
        importCreator="Ada"
        setImportCreator={() => undefined}
        importTags={["PLA"]}
        setImportTags={setImportTags}
        importTagText="PLA, ben"
        setImportTagText={() => undefined}
      />,
    );
    expect((screen.getByPlaceholderText("Creator for all imported files") as HTMLInputElement).value).toBe("Ada");
    expect((screen.getByPlaceholderText("Tags for all imported files") as HTMLInputElement).value).toBe("PLA, ben");
    fireEvent.click(screen.getByRole("button", { name: /PLA/ }));
    expect(setImportTags).toHaveBeenCalledWith([]);
    const options = [...document.querySelectorAll("#import-tags option")].map((option) => option.getAttribute("value"));
    expect(options).toEqual(["PLA, benchy"]);
  });
});
