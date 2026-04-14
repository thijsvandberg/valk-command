import { db } from "@/db";
import { alert, appSetting } from "@/db/schema";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

type NotificationCategory =
  | "general"
  | "pipeline"
  | "deployment"
  | "pr"
  | "sync"
  | "story-writer"
  | "system";

interface CreateNotificationOptions {
  category?: NotificationCategory;
  jiraKey?: string;
  linkUrl?: string;
}

const PREFS_KEY = "notification_preferences";

const DEFAULT_ENABLED: Record<NotificationCategory, boolean> = {
  general: true,
  pipeline: true,
  deployment: true,
  pr: true,
  sync: false,
  "story-writer": true,
  system: true,
};

function isCategoryEnabled(category: NotificationCategory): boolean {
  const row = db.select().from(appSetting).where(eq(appSetting.key, PREFS_KEY)).get();
  if (!row) return DEFAULT_ENABLED[category] ?? true;
  try {
    const prefs = JSON.parse(row.value) as Record<string, boolean>;
    return prefs[category] ?? DEFAULT_ENABLED[category] ?? true;
  } catch {
    return DEFAULT_ENABLED[category] ?? true;
  }
}

export function createNotification(
  type: string,
  message: string,
  options: CreateNotificationOptions = {},
): void {
  if (options.category && !isCategoryEnabled(options.category)) return;

  db.insert(alert).values({
    id: randomUUID(),
    type,
    message,
    createdAt: new Date().toISOString(),
    category: options.category,
    jiraKey: options.jiraKey,
    linkUrl: options.linkUrl,
  }).run();
}
