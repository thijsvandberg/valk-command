import { db } from "@/db";
import { alert } from "@/db/schema";
import { randomUUID } from "crypto";
import { getPreferences, type NotificationCategory } from "@/lib/notification-preferences";

interface CreateNotificationOptions {
  category?: NotificationCategory;
  jiraKey?: string;
  linkUrl?: string;
}

function isCategoryEnabled(category: NotificationCategory): boolean {
  const prefs = getPreferences();
  return prefs[category] ?? true;
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
