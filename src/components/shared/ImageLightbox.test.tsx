import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ImageLightbox } from "./ImageLightbox";

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon" />,
  ChevronLeft: () => <span data-testid="chevron-left" />,
  ChevronRight: () => <span data-testid="chevron-right" />,
}));

// The modal image carries the live transform; pull scale / translate out of it.
function modalImage() {
  return screen.getByRole("dialog").querySelector("img") as HTMLImageElement;
}
function readScale(img: HTMLImageElement) {
  const m = /scale\(([-\d.]+)\)/.exec(img.style.transform);
  return m ? parseFloat(m[1]) : NaN;
}
function readTranslate(img: HTMLImageElement) {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(img.style.transform);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: NaN, y: NaN };
}

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

  // --- Zoom + pan (BRDG-432) ---

  it("zooms in on wheel up and back down on wheel down, clamped to fit", () => {
    render(<ImageLightbox src="/photo.png" alt="Test photo" />);
    fireEvent.click(screen.getByLabelText("View Test photo fullscreen"));
    const img = modalImage();
    expect(readScale(img)).toBe(1);

    fireEvent.wheel(img, { deltaY: -100 });
    const zoomed = readScale(img);
    expect(zoomed).toBeGreaterThan(1);

    fireEvent.wheel(img, { deltaY: -100 });
    expect(readScale(img)).toBeGreaterThan(zoomed);

    // Wheel down enough to drop below fit clamps back to exactly 1 (no over-shrink).
    fireEvent.wheel(img, { deltaY: 2000 });
    expect(readScale(img)).toBe(1);
  });

  it("clamps zoom to a maximum", () => {
    render(<ImageLightbox src="/photo.png" alt="Test photo" />);
    fireEvent.click(screen.getByLabelText("View Test photo fullscreen"));
    const img = modalImage();
    for (let i = 0; i < 20; i++) fireEvent.wheel(img, { deltaY: -1000 });
    expect(readScale(img)).toBeLessThanOrEqual(5);
    expect(readScale(img)).toBeGreaterThan(4);
  });

  it("double-click toggles between fit and a zoomed level", () => {
    render(<ImageLightbox src="/photo.png" alt="Test photo" />);
    fireEvent.click(screen.getByLabelText("View Test photo fullscreen"));
    const img = modalImage();

    fireEvent.doubleClick(img);
    expect(readScale(img)).toBeGreaterThan(1);

    fireEvent.doubleClick(img);
    expect(readScale(img)).toBe(1);
  });

  it("pans only when zoomed in", () => {
    render(<ImageLightbox src="/photo.png" alt="Test photo" />);
    fireEvent.click(screen.getByLabelText("View Test photo fullscreen"));
    const img = modalImage();

    // Not zoomed: dragging does nothing.
    fireEvent.pointerDown(img, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(img, { clientX: 160, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(img, { pointerId: 1 });
    expect(readTranslate(img)).toEqual({ x: 0, y: 0 });

    // Zoom in, then drag pans by the pointer delta.
    fireEvent.doubleClick(img);
    fireEvent.pointerDown(img, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(img, { clientX: 160, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(img, { pointerId: 1 });
    expect(readTranslate(img)).toEqual({ x: 60, y: 40 });
  });

  it("resets zoom and pan when reopened", () => {
    render(<ImageLightbox src="/photo.png" alt="Test photo" />);
    fireEvent.click(screen.getByLabelText("View Test photo fullscreen"));
    let img = modalImage();
    fireEvent.doubleClick(img);
    fireEvent.pointerDown(img, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(img, { clientX: 30, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(img, { pointerId: 1 });
    expect(readScale(img)).toBeGreaterThan(1);

    fireEvent.click(screen.getByLabelText("Close lightbox"));
    fireEvent.click(screen.getByLabelText("View Test photo fullscreen"));
    img = modalImage();
    expect(readScale(img)).toBe(1);
    expect(readTranslate(img)).toEqual({ x: 0, y: 0 });
  });

  // --- Gallery navigation (BRDG-432) ---

  const GALLERY = [
    { src: "/a.png", alt: "Alpha" },
    { src: "/b.png", alt: "Bravo" },
    { src: "/c.png", alt: "Charlie" },
  ];

  it("shows a counter and navigates with buttons, clamped at the ends", () => {
    render(<ImageLightbox src="/b.png" alt="Bravo" gallery={GALLERY} galleryIndex={1} />);
    fireEvent.click(screen.getByLabelText("View Bravo fullscreen"));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByText("2 / 3")).toBeInTheDocument();
    expect(modalImage()).toHaveAttribute("src", "/b.png");

    fireEvent.click(screen.getByLabelText("Next image"));
    expect(within(dialog).getByText("3 / 3")).toBeInTheDocument();
    expect(modalImage()).toHaveAttribute("src", "/c.png");
    expect(screen.getByLabelText("Next image")).toBeDisabled();

    // Clamped: clicking disabled next does not advance.
    fireEvent.click(screen.getByLabelText("Next image"));
    expect(within(dialog).getByText("3 / 3")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Previous image"));
    fireEvent.click(screen.getByLabelText("Previous image"));
    expect(within(dialog).getByText("1 / 3")).toBeInTheDocument();
    expect(modalImage()).toHaveAttribute("src", "/a.png");
    expect(screen.getByLabelText("Previous image")).toBeDisabled();
  });

  it("navigates with arrow keys", () => {
    render(<ImageLightbox src="/a.png" alt="Alpha" gallery={GALLERY} galleryIndex={0} />);
    fireEvent.click(screen.getByLabelText("View Alpha fullscreen"));
    const dialog = screen.getByRole("dialog");

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(dialog).getByText("2 / 3")).toBeInTheDocument();
    expect(modalImage()).toHaveAttribute("src", "/b.png");

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(within(dialog).getByText("1 / 3")).toBeInTheDocument();
    expect(modalImage()).toHaveAttribute("src", "/a.png");
  });

  it("resets zoom when navigating to another image", () => {
    render(<ImageLightbox src="/a.png" alt="Alpha" gallery={GALLERY} galleryIndex={0} />);
    fireEvent.click(screen.getByLabelText("View Alpha fullscreen"));
    const img = modalImage();
    fireEvent.doubleClick(img);
    expect(readScale(img)).toBeGreaterThan(1);

    fireEvent.click(screen.getByLabelText("Next image"));
    expect(readScale(modalImage())).toBe(1);
    expect(readTranslate(modalImage())).toEqual({ x: 0, y: 0 });
  });

  it("renders no nav controls or counter without a gallery", () => {
    render(<ImageLightbox src="/photo.png" alt="Test photo" />);
    fireEvent.click(screen.getByLabelText("View Test photo fullscreen"));
    expect(screen.queryByLabelText("Next image")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Previous image")).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+ \/ \d+$/)).not.toBeInTheDocument();
  });

  // --- Caption (BRDG-432) ---

  it("renders the alt text as a caption when provided", () => {
    render(<ImageLightbox src="/photo.png" alt="screenshot.png" />);
    fireEvent.click(screen.getByLabelText("View screenshot.png fullscreen"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("screenshot.png")).toBeInTheDocument();
  });

  it("renders no caption when alt is absent", () => {
    render(<ImageLightbox src="/photo.png" />);
    fireEvent.click(screen.getByLabelText("View image fullscreen"));
    const dialog = screen.getByRole("dialog");
    // Caption and counter are the only translucent pills inside the modal.
    expect(dialog.querySelectorAll("span.backdrop-blur-sm").length).toBe(0);
  });
});
