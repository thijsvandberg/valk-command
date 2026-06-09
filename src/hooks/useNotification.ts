"use client";

import { useState, useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";

export type NotificationPermission = "default" | "granted" | "denied";

interface NotifyOptions {
  body?: string;
  tag?: string;
  onClick?: () => void;
}

interface UseNotificationReturn {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  notify: (title: string, options?: NotifyOptions) => void;
  isTabHidden: () => boolean;
}

function getPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  return Notification.permission as NotificationPermission;
}

export function useNotification(): UseNotificationReturn {
  const [enabled, setEnabled] = useLocalStorage("bridge:notifications-enabled", true);
  const [permission, setPermission] = useState<NotificationPermission>(getPermission);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === "undefined" || !("Notification" in window)) return "denied";
    const result = await Notification.requestPermission();
    const mapped = result as NotificationPermission;
    setPermission(mapped);
    return mapped;
  }, []);

  const isTabHidden = useCallback((): boolean => {
    if (typeof document === "undefined") return false;
    return document.hidden;
  }, []);

  const notify = useCallback(
    (title: string, options?: NotifyOptions) => {
      if (!enabled) return;
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (!document.hidden) return;
      if (Notification.permission !== "granted") return;

      const notification = new Notification(title, {
        body: options?.body,
        tag: options?.tag,
        icon: "/app-icon?size=192",
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        options?.onClick?.();
      };
    },
    [enabled],
  );

  return {
    enabled,
    setEnabled,
    permission,
    requestPermission,
    notify,
    isTabHidden,
  };
}
