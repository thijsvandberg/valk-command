import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-client", () => ({
  deprecatedAreas: { list: vi.fn(), add: vi.fn(), remove: vi.fn(), update: vi.fn() },
}));

import { deprecatedAreas } from "@/lib/api-client";
import DeprecatedAreasPage from "./page";

const listMock = deprecatedAreas.list as unknown as ReturnType<typeof vi.fn>;

describe("DeprecatedAreasPage data states (BRDG-423)", () => {
  beforeEach(() => {
    listMock.mockReset();
  });

  it("shows the shared loading state while fetching", () => {
    listMock.mockReturnValue(new Promise(() => {}));
    render(<DeprecatedAreasPage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows the shared empty state when there are no areas", async () => {
    listMock.mockResolvedValue({ areas: [] });
    render(<DeprecatedAreasPage />);
    await waitFor(() => {
      expect(screen.getByText("No deprecated areas yet")).toBeInTheDocument();
    });
  });

  it("surfaces a fetch failure with a retry affordance", async () => {
    listMock.mockRejectedValue(new Error("Areas failed to load"));
    render(<DeprecatedAreasPage />);
    await waitFor(() => {
      expect(screen.getByText("Areas failed to load")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
