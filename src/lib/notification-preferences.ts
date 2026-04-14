import "server-only";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";

export type NotificationCategory =
  | "general"
  | "pipeline"
  | "deployment"
  | "pr"
  | "sync"
  | "story-writer"
  | "system";

export type NotificationPreferences = Record<NotificationCategory, boolean>;

export const NOTIFICATION_PREFS_KEY = "notification_preferences";

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  general: true,
  pipeline: true,
  deployment: true,
  pr: true,
  sync: false,
  "story-writer": true,
  system: true,
};

export function getPreferences(): NotificationPreferences {
  const row = db.select().from(appSetting).where(eq(appSetting.key, NOTIFICATION_PREFS_KEY)).get();
  if (!row) return { ...DEFAULT_PREFERENCES };
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}
