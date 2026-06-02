import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetColor = vi.fn().mockResolvedValue(undefined);
vi.mock("@/hooks/useEpics", () => ({
  useSetEpicColor: () => mockSetColor,
}));

import { EpicColorPicker } from "./EpicColorPicker";
import { EPIC_PALETTE } from "@/lib/epic-palette";

describe("EpicColorPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a trigger labelled for setting a color when unset", () => {
    render(<EpicColorPicker epicKey="VPL-E1" name="Alpha" color={null} />);
    expect(screen.getByRole("button", { name: /set epic color/i })).toBeInTheDocument();
  });

  it("renders a trigger labelled for changing a color when set", () => {
    render(<EpicColorPicker epicKey="VPL-E1" name="Alpha" color={EPIC_PALETTE[0].base} />);
    expect(screen.getByRole("button", { name: /change epic color/i })).toBeInTheDocument();
  });

  it("opens the palette and exposes every swatch as a radio", () => {
    render(<EpicColorPicker epicKey="VPL-E1" name="Alpha" color={null} />);
    fireEvent.click(screen.getByRole("button", { name: /set epic color/i }));
    for (const swatch of EPIC_PALETTE) {
      expect(screen.getByRole("menuitemradio", { name: swatch.label })).toBeInTheDocument();
    }
  });

  it("commits the chosen palette base", async () => {
    render(<EpicColorPicker epicKey="VPL-E1" name="Alpha" color={null} />);
    fireEvent.click(screen.getByRole("button", { name: /set epic color/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: EPIC_PALETTE[1].label }));
    await waitFor(() =>
      expect(mockSetColor).toHaveBeenCalledWith("VPL-E1", "Alpha", EPIC_PALETTE[1].base),
    );
  });

  it("does not offer reset when no color is set", () => {
    render(<EpicColorPicker epicKey="VPL-E1" name="Alpha" color={null} />);
    fireEvent.click(screen.getByRole("button", { name: /set epic color/i }));
    expect(screen.queryByRole("menuitem", { name: /reset to default/i })).not.toBeInTheDocument();
  });

  it("clears the color with null via reset", async () => {
    render(<EpicColorPicker epicKey="VPL-E1" name="Alpha" color={EPIC_PALETTE[0].base} />);
    fireEvent.click(screen.getByRole("button", { name: /change epic color/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /reset to default/i }));
    await waitFor(() => expect(mockSetColor).toHaveBeenCalledWith("VPL-E1", "Alpha", null));
  });

  it("marks the active swatch as checked", () => {
    render(<EpicColorPicker epicKey="VPL-E1" name="Alpha" color={EPIC_PALETTE[2].base} />);
    fireEvent.click(screen.getByRole("button", { name: /change epic color/i }));
    expect(screen.getByRole("menuitemradio", { name: EPIC_PALETTE[2].label })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
