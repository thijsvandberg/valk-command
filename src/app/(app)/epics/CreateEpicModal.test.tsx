import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateEpicModal } from "./CreateEpicModal";

vi.mock("swr", () => ({
  mutate: vi.fn().mockResolvedValue(undefined),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const create = vi.fn();
vi.mock("@/lib/api-client", () => ({
  epics: {
    create: (...args: unknown[]) => create(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({ key: "VPL-7" });
});

function renderModal() {
  const onClose = vi.fn();
  const showToast = vi.fn();
  render(<CreateEpicModal onClose={onClose} showToast={showToast} />);
  return { onClose, showToast };
}

describe("CreateEpicModal", () => {
  it("disables Create while the title is empty and enables it once typed", () => {
    renderModal();
    const createBtn = screen.getByRole("button", { name: /Create epic/i });
    expect(createBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Booking calendar revamp/i), {
      target: { value: "My epic" },
    });
    expect(createBtn).toBeEnabled();
  });

  it("creates the epic and redirects to its single view on success", async () => {
    const { showToast } = renderModal();
    fireEvent.change(screen.getByPlaceholderText(/Booking calendar revamp/i), {
      target: { value: "My epic" },
    });
    fireEvent.change(screen.getByPlaceholderText(/What is this epic about/i), {
      target: { value: "Some context" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create epic/i }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({ title: "My epic", description: "Some context" });
    });
    expect(showToast).toHaveBeenCalledWith("Epic created");
    expect(push).toHaveBeenCalledWith("/tickets/VPL-7");
  });

  it("omits the description when it is left blank", async () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/Booking calendar revamp/i), {
      target: { value: "Title only" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create epic/i }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({ title: "Title only" });
    });
  });

  it("keeps the modal open and shows an error when the create fails", async () => {
    create.mockRejectedValueOnce(new Error("Jira down"));
    const { onClose } = renderModal();
    fireEvent.change(screen.getByPlaceholderText(/Booking calendar revamp/i), {
      target: { value: "My epic" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create epic/i }));

    await waitFor(() => {
      expect(screen.getByText("Jira down")).toBeInTheDocument();
    });
    expect(push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Create button is interactive again after the failure.
    expect(screen.getByRole("button", { name: /Create epic/i })).toBeEnabled();
  });
});
