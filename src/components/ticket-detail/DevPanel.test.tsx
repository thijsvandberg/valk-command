import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DevPanel } from "./DevPanel";
import type { DevInfoPayload, DevBranch, DevPullRequest, DevCommit, DevBuild } from "@/lib/bitbucket-client";

function makeBranch(overrides: Partial<DevBranch> = {}): DevBranch {
  return {
    name: "feature/my-branch",
    url: "https://bitbucket.org/repo/branch/feature/my-branch",
    lastCommit: {
      id: "abc123",
      message: "Last commit message",
      date: new Date(Date.now() - 3600000).toISOString(),
      author: "Dev",
    },
    ...overrides,
  };
}

function makePR(overrides: Partial<DevPullRequest> = {}): DevPullRequest {
  return {
    id: "1",
    title: "My Pull Request",
    url: "https://bitbucket.org/repo/pull-requests/1",
    status: "OPEN",
    author: "Developer",
    repo: "my-repo",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    reviewers: [],
    commentCount: 0,
    taskCount: 0,
    buildStatuses: [],
    diffStats: null,
    sourceBranch: "feature/branch",
    destBranch: "main",
    ...overrides,
  };
}

function makeCommit(overrides: Partial<DevCommit> = {}): DevCommit {
  return {
    id: "def456",
    message: "A commit message",
    date: new Date(Date.now() - 1800000).toISOString(),
    author: "Dev",
    url: "https://bitbucket.org/repo/commits/def456",
    ...overrides,
  };
}

function makeBuild(overrides: Partial<DevBuild> = {}): DevBuild {
  return {
    name: "Build #42",
    state: "SUCCESSFUL",
    url: "https://bitbucket.org/pipelines/42",
    completedAt: new Date(Date.now() - 900000).toISOString(),
    ...overrides,
  };
}

function makePayload(overrides: Partial<DevInfoPayload> = {}): DevInfoPayload {
  return {
    branches: [],
    pullRequests: [],
    commits: [],
    builds: [],
    deployments: [],
    ...overrides,
  };
}

function renderPanel(data: DevInfoPayload | null | undefined = null, isLoading = false) {
  const onExpand = vi.fn();
  const result = render(
    <DevPanel data={data} isLoading={isLoading} onExpand={onExpand} />,
  );
  return { ...result, onExpand };
}

describe("DevPanel", () => {
  it("renders Development header", () => {
    renderPanel();
    expect(screen.getByText("Development")).toBeInTheDocument();
  });

  it("shows (0) when no data", () => {
    renderPanel();
    expect(screen.getByText("(0)")).toBeInTheDocument();
  });

  it("shows branch count summary", () => {
    renderPanel(makePayload({ branches: [makeBranch()] }));
    expect(screen.getByText(/1 branch/)).toBeInTheDocument();
  });

  it("shows PR count summary", () => {
    renderPanel(makePayload({ pullRequests: [makePR()] }));
    expect(screen.getByText(/1 PR/)).toBeInTheDocument();
  });

  it("shows commit count summary", () => {
    renderPanel(makePayload({ commits: [makeCommit()] }));
    expect(screen.getByText(/1 commit/)).toBeInTheDocument();
  });

  it("shows plural branches correctly", () => {
    renderPanel(makePayload({ branches: [makeBranch(), makeBranch({ name: "another" })] }));
    expect(screen.getByText(/2 branches/)).toBeInTheDocument();
  });

  it("expands/collapses on button click", () => {
    renderPanel(makePayload({ branches: [makeBranch()] }));
    expect(screen.queryByText("feature/my-branch")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText("feature/my-branch")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.queryByText("feature/my-branch")).not.toBeInTheDocument();
  });

  it("shows 'No development activity' when expanded and no data", () => {
    renderPanel(makePayload());
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("No development activity linked to this ticket")).toBeInTheDocument();
  });

  it("renders branch link with correct href", () => {
    renderPanel(makePayload({ branches: [makeBranch()] }));
    fireEvent.click(screen.getByRole("button"));

    const link = screen.getByText("feature/my-branch");
    expect(link.closest("a")).toHaveAttribute("href", "https://bitbucket.org/repo/branch/feature/my-branch");
  });

  it("renders branch link with target=_blank", () => {
    renderPanel(makePayload({ branches: [makeBranch()] }));
    fireEvent.click(screen.getByRole("button"));

    const link = screen.getByText("feature/my-branch").closest("a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders PR title with link", () => {
    renderPanel(makePayload({ pullRequests: [makePR()] }));
    fireEvent.click(screen.getByRole("button"));

    const link = screen.getByText("My Pull Request");
    expect(link.closest("a")).toHaveAttribute("href", "https://bitbucket.org/repo/pull-requests/1");
    expect(link.closest("a")).toHaveAttribute("target", "_blank");
  });

  it("renders PR status badge", () => {
    renderPanel(makePayload({ pullRequests: [makePR({ status: "OPEN" })] }));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("OPEN")).toBeInTheDocument();
  });

  it("renders merged PR status", () => {
    renderPanel(makePayload({ pullRequests: [makePR({ status: "MERGED" })] }));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("MERGED")).toBeInTheDocument();
  });

  it("renders latest commit message", () => {
    renderPanel(makePayload({ commits: [makeCommit()] }));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("A commit message")).toBeInTheDocument();
  });

  it("renders commit link when url is present", () => {
    renderPanel(makePayload({ commits: [makeCommit()] }));
    fireEvent.click(screen.getByRole("button"));

    const link = screen.getByText("A commit message").closest("a");
    expect(link).toHaveAttribute("href", "https://bitbucket.org/repo/commits/def456");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders build name and link", () => {
    renderPanel(makePayload({ builds: [makeBuild()] }));
    fireEvent.click(screen.getByRole("button"));

    const link = screen.getByText("Build #42");
    expect(link.closest("a")).toHaveAttribute("href", "https://bitbucket.org/pipelines/42");
    expect(link.closest("a")).toHaveAttribute("target", "_blank");
  });

  it("shows expand button when data exists and onExpand provided", () => {
    renderPanel(makePayload({ branches: [makeBranch()] }));
    const expandBtn = screen.getByTitle("Open in full view");
    expect(expandBtn).toBeInTheDocument();
  });

  it("calls onExpand when expand button clicked", () => {
    const { onExpand } = renderPanel(makePayload({ branches: [makeBranch()] }));
    fireEvent.click(screen.getByTitle("Open in full view"));
    expect(onExpand).toHaveBeenCalled();
  });

  it("shows PR reviewer approval ratio", () => {
    const pr = makePR({
      reviewers: [
        { name: "Alice", approved: true },
        { name: "Bob", approved: false },
      ],
    });
    renderPanel(makePayload({ pullRequests: [pr] }));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("shows PR comment count when > 0", () => {
    renderPanel(makePayload({ pullRequests: [makePR({ commentCount: 3 })] }));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows branch source -> dest flow", () => {
    const pr = makePR({ sourceBranch: "feature/x", destBranch: "main" });
    renderPanel(makePayload({ pullRequests: [pr] }));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/feature\/x/)).toBeInTheDocument();
    expect(screen.getByText(/main/)).toBeInTheDocument();
  });

  it("shows loading skeleton when isLoading and no data yet", () => {
    renderPanel(undefined, true);
    fireEvent.click(screen.getByRole("button"));
    // The skeleton renders div elements with animation; check that the no-data message is absent
    expect(screen.queryByText("No development activity linked to this ticket")).not.toBeInTheDocument();
  });
});
