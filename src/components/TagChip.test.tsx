import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagChip } from "./TagChip";

afterEach(cleanup);

describe("TagChip", () => {
  it("renders a colored chip and a removable button", () => {
    render(<TagChip name="Flexi" color="#111111" />);
    const chip = screen.getByText("Flexi");
    expect(chip.tagName).toBe("SPAN");
    expect(chip.style.backgroundColor).toBe("rgb(17, 17, 17)");
    expect(chip.style.color).toBe("rgb(255, 255, 255)");
    expect(chip.style.borderColor).toBe("rgb(17, 17, 17)");

    const onClick = vi.fn();
    render(<TagChip name="Resin" onClick={onClick} ariaLabel="Remove Resin" />);
    const button = screen.getByRole("button", { name: "Remove Resin" });
    expect(button.textContent).toBe("Resin ×");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
