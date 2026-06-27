import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

interface AssignableUser {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  initials: string;
  isFavorite: boolean;
  isPo: boolean;
  teams: string[];
}

let peopleData: { users: AssignableUser[] } | undefined;
let peopleError: Error | undefined;
let peopleLoading = false;
const peopleMutate = vi.fn();

vi.mock("swr", () => ({
  default: () => ({
    data: peopleData,
    isLoading: peopleLoading,
    error: peopleError,
    mutate: peopleMutate,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(),
  favoriteUsers: { add: vi.fn(), remove: vi.fn() },
  poUsers: { add: vi.fn(), remove: vi.fn() },
  userTeams: { set: vi.fn() },
}));

import PeoplePage from "./page";

describe("PeoplePage data states (BRDG-423)", () => {
  beforeEach(() => {
    peopleData = undefined;
    peopleError = undefined;
    peopleLoading = false;
    peopleMutate.mockClear();
  });

  it("shows the shared loading state while fetching", () => {
    peopleLoading = true;
    render(<PeoplePage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows the shared empty state when there are no people", () => {
    peopleData = { users: [] };
    render(<PeoplePage />);
    expect(screen.getByText("No people found")).toBeInTheDocument();
  });

  it("surfaces a fetch failure with a retry affordance instead of a blank list", () => {
    peopleError = new Error("People endpoint failed");
    render(<PeoplePage />);
    expect(screen.getByText("People endpoint failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(peopleMutate).toHaveBeenCalled();
  });
});
