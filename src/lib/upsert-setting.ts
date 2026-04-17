import { db } from "@/db";
import { appSetting } from "@/db/schema";

export async function upsertSetting(key: string, value: string) {
  await db.insert(appSetting)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSetting.key, set: { value } });
}
