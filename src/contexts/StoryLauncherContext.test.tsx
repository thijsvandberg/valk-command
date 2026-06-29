import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StoryLauncherProvider, useStoryLauncher } from "./StoryLauncherContext";

// The modal is dynamically imported; stub next/dynamic with a component that
// reflects the `open` prop so we can assert the provider toggles it.
vi.mock("next/dynamic", () => ({
  default: () => {
    const LauncherStub = ({ open }: { open: boolean }) =>
      open ? <div data-testid="launcher-modal" /> : null;
    return LauncherStub;
  },
}));

function Consumer() {
  const { openLauncher } = useStoryLauncher();
  return <button type="button" onClick={openLauncher}>open</button>;
}

describe("StoryLauncherProvider", () => {
  it("mounts the launcher modal only after openLauncher is called", () => {
    render(
      <StoryLauncherProvider>
        <Consumer />
      </StoryLauncherProvider>,
    );
    expect(screen.queryByTestId("launcher-modal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByTestId("launcher-modal")).toBeInTheDocument();
  });

  it("defaults to a no-op opener when rendered outside a provider", () => {
    expect(() => {
      render(<Consumer />);
      fireEvent.click(screen.getByRole("button", { name: "open" }));
    }).not.toThrow();
  });
});
