import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReadinessOption } from "./ReadinessOption";
import { READINESS_CONFIG } from "@/types/ticket";

describe("ReadinessOption", () => {
  it("renders the 'none' sentinel as Ready for Development", () => {
    render(<ReadinessOption value="none" />);
    expect(screen.getByText("Ready for Development")).toBeInTheDocument();
  });

  it("renders an enum value using its config label and icon", () => {
    const { container } = render(<ReadinessOption value="on_hold" />);
    expect(screen.getByText(READINESS_CONFIG.on_hold.label)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders waiting_for_feedback label", () => {
    render(<ReadinessOption value="waiting_for_feedback" />);
    expect(screen.getByText(READINESS_CONFIG.waiting_for_feedback.label)).toBeInTheDocument();
  });
});
