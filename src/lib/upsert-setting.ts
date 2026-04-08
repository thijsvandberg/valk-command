import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function upsertSetting(key: string, value: string) {
  const existing = await db.query.appSetting.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.key, key),
  });
  if (existing) {
    await db.update(appSetting).set({ value }).where(eq(appSetting.key, key));
  } else {
    await db.insert(appSetting).values({ key, value });
  }
}
