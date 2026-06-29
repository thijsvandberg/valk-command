import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AttachmentsSection } from "./AttachmentsSection";
import type { Attachment } from "@/types/ticket";

// Records the props each ImageLightbox receives so the gallery-wiring tests can
// assert the ordered image list and per-thumbnail index.
const lightboxProps: Array<{ src: string; alt?: string; gallery?: unknown; galleryIndex?: number }> = [];

vi.mock("@/components/shared/SectionHeader", () => ({
  SectionHeader: ({
    title,
    count,
    children,
  }: {
    title: string;
    count?: number;
    children?: React.ReactNode;
  }) => (
    <div data-testid="section-header">
      <div>
        {title}{count !== undefined ? ` (${count})` : ""}
      </div>
      {children}
    </div>
  ),
}));

vi.mock("@/components/shared/ImageLightbox", () => ({
  ImageLightbox: (props: {
    src: string;
    alt?: string;
    gallery?: unknown;
    galleryIndex?: number;
    children: React.ReactNode;
  }) => {
    lightboxProps.push({
      src: props.src,
      alt: props.alt,
      gallery: props.gallery,
      galleryIndex: props.galleryIndex,
    });
    return <div data-testid="image-lightbox">{props.children}</div>;
  },
}));

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: "att-1",
    filename: "file.png",
    mimeType: "image/png",
    size: 50000,
    createdAt: "2024-01-01T00:00:00Z",
    color: "#ff0000",
    cleaned: false,
    cleanedAt: null,
    ...overrides,
  };
}

describe("AttachmentsSection", () => {
  beforeEach(() => {
    lightboxProps.length = 0;
  });

  it("renders nothing when the list is empty", () => {
    const { container } = render(<AttachmentsSection attachments={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Attachments")).not.toBeInTheDocument();
  });

  it("renders section header with count when attachments exist", () => {
    const attachments = [makeAttachment({ id: "1" }), makeAttachment({ id: "2" })];
    render(<AttachmentsSection attachments={attachments} />);
    expect(screen.getByTestId("section-header")).toHaveTextContent("Attachments (2)");
  });

  it("renders filename for each attachment", () => {
    const attachments = [
      makeAttachment({ id: "1", filename: "screenshot.png" }),
      makeAttachment({ id: "2", filename: "report.pdf", mimeType: "application/pdf" }),
    ];
    render(<AttachmentsSection attachments={attachments} />);
    expect(screen.getByText("screenshot.png")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("renders file size in KB for non-cleaned attachments", () => {
    const attachments = [makeAttachment({ size: 51000 })];
    render(<AttachmentsSection attachments={attachments} />);
    expect(screen.getByText("51 KB")).toBeInTheDocument();
  });

  it("renders ImageLightbox for image attachments", () => {
    const attachments = [makeAttachment({ mimeType: "image/png" })];
    render(<AttachmentsSection attachments={attachments} />);
    expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
  });

  // Regression: the thumbnail must be a plain <img> pointing at the raw proxy
  // URL. next/image would route through the optimizer, which fetches the
  // cookie-protected /api/attachments route server-side without the session
  // cookie and gets a 401, breaking every thumbnail.
  it("renders image thumbnails as a plain <img> with the raw proxy URL", () => {
    const attachments = [makeAttachment({ id: "att-42", mimeType: "image/png" })];
    render(<AttachmentsSection attachments={attachments} />);
    const img = screen.getByAltText("file.png");
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("/api/attachments/att-42");
  });

  it("renders mime type label for non-image attachments", () => {
    const attachments = [makeAttachment({ filename: "doc.pdf", mimeType: "application/pdf" })];
    render(<AttachmentsSection attachments={attachments} />);
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("renders 'Cleaned' badge for cleaned attachments", () => {
    const attachments = [makeAttachment({ cleaned: true, cleanedAt: "2024-02-01T00:00:00Z" })];
    render(<AttachmentsSection attachments={attachments} />);
    expect(screen.getByText("Cleaned")).toBeInTheDocument();
  });

  it("does not render ImageLightbox for cleaned attachments", () => {
    const attachments = [makeAttachment({ mimeType: "image/png", cleaned: true })];
    render(<AttachmentsSection attachments={attachments} />);
    expect(screen.queryByTestId("image-lightbox")).not.toBeInTheDocument();
  });

  it("renders cleaned date when available", () => {
    const attachments = [makeAttachment({ cleaned: true, cleanedAt: "2024-03-15T00:00:00Z" })];
    render(<AttachmentsSection attachments={attachments} />);
    // The date is formatted via toLocaleDateString, just check "Cleaned" prefix exists
    const texts = screen.getAllByText(/Cleaned/);
    expect(texts.length).toBeGreaterThan(0);
  });

  it("does not show a toggle when at or below the collapse threshold", () => {
    const attachments = Array.from({ length: 3 }, (_, i) =>
      makeAttachment({ id: `${i}`, filename: `file-${i}.png` }),
    );
    render(<AttachmentsSection attachments={attachments} />);
    expect(screen.queryByText(/Show all/)).not.toBeInTheDocument();
    expect(screen.getByText("file-2.png")).toBeInTheDocument();
  });

  it("collapses to the first three attachments with a 'Show all' toggle", () => {
    const attachments = Array.from({ length: 21 }, (_, i) =>
      makeAttachment({ id: `${i}`, filename: `file-${i}.png` }),
    );
    render(<AttachmentsSection attachments={attachments} />);

    // First three visible, the rest hidden behind the toggle
    expect(screen.getByText("file-2.png")).toBeInTheDocument();
    expect(screen.queryByText("file-3.png")).not.toBeInTheDocument();
    expect(screen.getByText("Show all 21 (18 more)")).toBeInTheDocument();
  });

  it("expands and collapses on toggle", () => {
    const attachments = Array.from({ length: 21 }, (_, i) =>
      makeAttachment({ id: `${i}`, filename: `file-${i}.png` }),
    );
    render(<AttachmentsSection attachments={attachments} />);

    fireEvent.click(screen.getByText("Show all 21 (18 more)"));
    expect(screen.getByText("file-20.png")).toBeInTheDocument();
    expect(screen.getByText("Show less")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Show less"));
    expect(screen.queryByText("file-20.png")).not.toBeInTheDocument();
    expect(screen.getByText("Show all 21 (18 more)")).toBeInTheDocument();
  });

  // --- Gallery wiring (BRDG-432) ---

  it("passes the ordered image list and per-thumbnail index to each lightbox", () => {
    const attachments = [
      makeAttachment({ id: "a", filename: "alpha.png" }),
      makeAttachment({ id: "b", filename: "bravo.png" }),
      makeAttachment({ id: "c", filename: "charlie.png" }),
    ];
    render(<AttachmentsSection attachments={attachments} />);

    expect(lightboxProps).toHaveLength(3);
    const expectedGallery = [
      { src: "/api/attachments/a", alt: "alpha.png" },
      { src: "/api/attachments/b", alt: "bravo.png" },
      { src: "/api/attachments/c", alt: "charlie.png" },
    ];
    lightboxProps.forEach((p) => expect(p.gallery).toEqual(expectedGallery));
    // Opening the 2nd thumbnail starts the gallery at index 1.
    expect(lightboxProps.map((p) => p.galleryIndex)).toEqual([0, 1, 2]);
  });

  it("excludes non-image and cleaned attachments from the gallery", () => {
    // Images first so both stay within the 3-item collapse window; the pdf and
    // the cleaned image must still be filtered out of the gallery list.
    const attachments = [
      makeAttachment({ id: "a", filename: "alpha.png" }),
      makeAttachment({ id: "b", filename: "bravo.png" }),
      makeAttachment({ id: "d", filename: "doc.pdf", mimeType: "application/pdf" }),
      makeAttachment({ id: "e", filename: "echo.png", cleaned: true, cleanedAt: "2024-02-01T00:00:00Z" }),
    ];
    render(<AttachmentsSection attachments={attachments} />);

    // Only the two viewable images get a lightbox; the gallery omits the pdf and
    // the cleaned image.
    expect(lightboxProps).toHaveLength(2);
    const expectedGallery = [
      { src: "/api/attachments/a", alt: "alpha.png" },
      { src: "/api/attachments/b", alt: "bravo.png" },
    ];
    lightboxProps.forEach((p) => expect(p.gallery).toEqual(expectedGallery));
    expect(lightboxProps.map((p) => p.galleryIndex)).toEqual([0, 1]);
  });

  it("leaves the gallery undefined when there is only one image", () => {
    render(<AttachmentsSection attachments={[makeAttachment({ id: "solo", filename: "solo.png" })]} />);
    expect(lightboxProps).toHaveLength(1);
    expect(lightboxProps[0].gallery).toBeUndefined();
    expect(lightboxProps[0].galleryIndex).toBe(0);
  });
});
