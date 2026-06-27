import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Select } from "./Select";

describe("Select", () => {
  it("renders options and reflects value", () => {
    render(
      <Select value="b" onChange={() => {}} aria-label="Pick">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    const select = screen.getByRole("combobox", { name: "Pick" }) as HTMLSelectElement;
    expect(select.value).toBe("b");
  });

  it("carries the canonical recipe with a visible focus ring", () => {
    render(
      <Select aria-label="Pick">
        <option value="a">A</option>
      </Select>,
    );
    const select = screen.getByRole("combobox");
    expect(select.className).toContain("border-border-strong");
    expect(select.className).toContain("focus:ring-1");
    expect(select.className).toContain("focus:border-[var(--color-brand-500)]");
    expect(select.className).toContain("disabled:opacity-50");
  });

  it("supports disabled", () => {
    render(
      <Select aria-label="Pick" disabled>
        <option value="a">A</option>
      </Select>,
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
  });
});
