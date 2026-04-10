import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, afterAll, vi } from "vitest";
import { closeAllTestDbs } from "@/db/test-utils";

vi.mock("server-only", () => ({}));

afterEach(() => {
  cleanup();
});

afterAll(() => {
  closeAllTestDbs();
});
