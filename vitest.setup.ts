import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, afterAll } from "vitest";
import { closeAllTestDbs } from "@/db/test-utils";

afterEach(() => {
  cleanup();
});

afterAll(() => {
  closeAllTestDbs();
});
