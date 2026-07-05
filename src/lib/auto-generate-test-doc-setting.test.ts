// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  getAutoGenerateTestDoc,
  AUTO_GENERATE_TEST_DOC_KEY,
  AUTO_GENERATE_TEST_DOC_DEFAULT,
} from "./auto-generate-test-doc-setting";
import { appSetting } from "@/db/schema";

describe("getAutoGenerateTestDoc", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns the default (true) when no DB row exists", async () => {
    expect(AUTO_GENERATE_TEST_DOC_DEFAULT).toBe(true);
    const result = await getAutoGenerateTestDoc();
    expect(result).toBe(true);
  });

  it("returns true when the stored value is 'true'", async () => {
    testDb.insert(appSetting).values({ key: AUTO_GENERATE_TEST_DOC_KEY, value: "true" }).run();
    const result = await getAutoGenerateTestDoc();
    expect(result).toBe(true);
  });

  it("returns false when the stored value is 'false'", async () => {
    testDb.insert(appSetting).values({ key: AUTO_GENERATE_TEST_DOC_KEY, value: "false" }).run();
    const result = await getAutoGenerateTestDoc();
    expect(result).toBe(false);
  });

  it("returns the default for an unrelated key", async () => {
    testDb.insert(appSetting).values({ key: "some_other_key", value: "false" }).run();
    const result = await getAutoGenerateTestDoc();
    expect(result).toBe(true);
  });
});
