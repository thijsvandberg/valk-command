import { db } from "@/db";
import { alert } from "@/db/schema";
import { randomUUID } from "crypto";

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

export function createNotification(
  type: string,
  message: string,
  options: CreateNotificationOptions = {},
): void {
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
