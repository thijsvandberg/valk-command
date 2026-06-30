import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx", "**/*.test.js"],
    exclude: ["node_modules", "deleted"],
    // No `bail`: a failing run must report every failure so session-vs-parallel
    // breakage can be attributed (BRDG-450). bail:5 repeatedly masked the true
    // blast radius (BRDG-338/320/343/438).
    // Cap workers so heavy jsdom files cannot exhaust a 16GB machine (BRDG-343).
    maxWorkers: 4,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/test/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
