import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";

export const AUTO_GENERATE_TEST_DOC_KEY = "auto_generate_test_doc";
export const AUTO_GENERATE_TEST_DOC_DEFAULT = true;

export async function getAutoGenerateTestDoc(): Promise<boolean> {
  const row = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, AUTO_GENERATE_TEST_DOC_KEY))
    .get();
  if (!row) return AUTO_GENERATE_TEST_DOC_DEFAULT;
  return row.value === "true";
}
