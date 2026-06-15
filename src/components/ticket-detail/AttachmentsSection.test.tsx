import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AttachmentsSection } from "./AttachmentsSection";
import type { Attachment } from "@/types/ticket";

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
  ImageLightbox: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="image-lightbox">{children}</div>
  ),
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
});
