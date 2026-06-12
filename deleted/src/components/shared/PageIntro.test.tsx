import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageIntro } from "./PageIntro";

describe("PageIntro", () => {
  it("renders title as h1", () => {
    render(<PageIntro title="Dashboard" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Dashboard",
    );
  });

  it("renders description when provided", () => {
    render(
      <PageIntro title="Dashboard" description="Your sprint cockpit." />,
    );
    expect(screen.getByText("Your sprint cockpit.")).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    const { container } = render(<PageIntro title="Dashboard" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});
