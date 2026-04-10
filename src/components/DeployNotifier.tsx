"use client";

import { useEffect, useRef } from "react";
import { useNotifications, useDeploySettings } from "@/hooks/usePipelines";
import { useNotification } from "@/hooks/useNotification";

// Watches for new deployment notifications and sends browser push notifications
export function DeployNotifier() {
  const { notifications } = useNotifications(10);
  const { settings } = useDeploySettings();
  const { notify, permission, requestPermission } = useNotification();
  const seenIdsRef = useRef(new Set<string>());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!settings?.enabled) return;
    if (permission === "denied") return;

    // On first load, just record current IDs to avoid notifying about old events
    if (!initializedRef.current) {
      for (const n of notifications) {
        seenIdsRef.current.add(n.id);
      }
      initializedRef.current = true;
      return;
    }

    for (const n of notifications) {
      if (seenIdsRef.current.has(n.id)) continue;
      seenIdsRef.current.add(n.id);

      // Only send browser notifications for deployment events
      if (n.type !== "deployment") continue;

      // Check environment filter
      const envMatch = n.message.match(/to (\S+)/);
      const environment = envMatch?.[1] ?? "";
      if (settings.environments && settings.environments[environment] === false) continue;

      // Request permission if needed
      if (permission === "default") {
        requestPermission();
        continue;
      }

      // Send browser notification
      notify(`Deployment ${n.message.includes("completed") ? "Complete" : "Failed"}`, {
        body: n.message,
        tag: `deploy-${n.id}`,
        onClick: () => {
          if (n.jiraKey) {
            window.location.href = `/tickets/${n.jiraKey}`;
          }
        },
      });
    }
  }, [notifications, settings, notify, permission, requestPermission]);

  return null;
}
