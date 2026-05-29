import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ImageLightbox } from "./ImageLightbox";

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon" />,
}));

describe("ImageLightbox", () => {
  it("renders image trigger with correct src", () => {
    render(<ImageLightbox src="/photo.png" alt="Test photo" />);
    const img = screen.getByAltText("Test photo");
    expect(img).toHaveAttribute("src", "/photo.png");
  });

  it("renders custom children as trigger instead of img", () => {
    render(
      <ImageLightbox src="/photo.png" alt="Test">
        <span data-testid="custom-trigger">Click me</span>
      </ImageLightbox>,
    );
    expect(screen.getByTestId("custom-trigger")).toBeInTheDocument();
  });

  it("opens lightbox on click", () => {
    render(<ImageLightbox src="/photo.png" alt="Test photo" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("View Test photo fullscreen"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Close lightbox")).toBeInTheDocument();
  });

  it("closes lightbox when close button is clicked", () => {
    render(<ImageLightbox src="/photo.png" alt="Test photo" />);
    fireEvent.click(screen.getByLabelText("View Test photo fullscreen"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close lightbox"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes lightbox on Escape key", () => {
    render(<ImageLightbox src="/photo.png" alt="Test photo" />);
    fireEvent.click(screen.getByLabelText("View Test photo fullscreen"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes lightbox when clicking backdrop", () => {
    render(<ImageLightbox src="/photo.png" alt="Test photo" />);
    fireEvent.click(screen.getByLabelText("View Test photo fullscreen"));

    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses fallback aria-label when no alt provided", () => {
    render(<ImageLightbox src="/photo.png" />);
    expect(screen.getByLabelText("View image fullscreen")).toBeInTheDocument();
  });
});
