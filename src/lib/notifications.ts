import { db } from "@/db";
import { alert } from "@/db/schema";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getPreferences, type NotificationCategory } from "@/lib/notification-preferences";

interface CreateNotificationOptions {
  category?: NotificationCategory;
  jiraKey?: string;
  linkUrl?: string;
  // ISO timestamp of the actual event (e.g. when a PR was merged in Bitbucket).
  // When provided and older than createdAt, the UI shows a late-sync indicator.
  eventAt?: string;
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
    eventAt: options.eventAt ?? null,
    category: options.category,
    jiraKey: options.jiraKey,
    linkUrl: options.linkUrl,
  }).run();
}

// Like createNotification but deduplicates on type + jiraKey: if an unread
// notification with the same type and jiraKey exists, update its timestamp
// instead of inserting a duplicate.
export function createOrUpdateNotification(
  type: string,
  message: string,
  options: CreateNotificationOptions = {},
): void {
  if (options.category && !isCategoryEnabled(options.category)) return;

  if (options.jiraKey) {
    const conditions = [eq(alert.type, type), eq(alert.jiraKey, options.jiraKey), eq(alert.read, false)];
    const existing = db.select({ id: alert.id }).from(alert).where(and(...conditions)).get();
    if (existing) {
      db.update(alert)
        .set({ createdAt: new Date().toISOString(), message })
        .where(eq(alert.id, existing.id))
        .run();
      return;
    }
  }

  createNotification(type, message, options);
}
