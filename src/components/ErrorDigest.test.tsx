// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { ErrorDigest } from "./ErrorDigest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorDigest", () => {
  it("renders nothing without a digest", () => {
    const { container } = render(<ErrorDigest />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the digest value", () => {
    render(<ErrorDigest digest="ref-42" />);
    expect(screen.getByText("ref-42")).toBeInTheDocument();
  });

  it("copies the digest to the clipboard on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<ErrorDigest digest="ref-42" />);
    fireEvent.click(screen.getByRole("button"));

    expect(writeText).toHaveBeenCalledWith("ref-42");
  });

  it("does not throw when the clipboard API is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    render(<ErrorDigest digest="ref-42" />);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
  });
});
