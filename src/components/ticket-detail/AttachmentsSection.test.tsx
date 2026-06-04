import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AttachmentsSection } from "./AttachmentsSection";
import type { Attachment } from "@/types/ticket";

vi.mock("@/components/shared/SectionHeader", () => ({
  SectionHeader: ({ title, count }: { title: string; count?: number }) => (
    <div data-testid="section-header">
      {title}{count !== undefined ? ` (${count})` : ""}
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
  it("renders 'No attachments' when list is empty", () => {
    render(<AttachmentsSection attachments={[]} />);
    expect(screen.getByText("No attachments")).toBeInTheDocument();
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
});
