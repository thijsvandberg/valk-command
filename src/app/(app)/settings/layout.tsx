"use client";

import { usePathname } from "next/navigation";
import { Settings2, MessageSquare, Clock, Bell } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { TabBar, TabLink } from "@/components/shared/TabBar";

const TABS = [
  { href: "/settings/prompts", label: "Quick Prompts", icon: MessageSquare },
  { href: "/settings/scheduler", label: "Scheduled Tasks", icon: Clock },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      <ViewHeader
        icon={<Settings2 size={15} strokeWidth={1.5} className="text-white/30" />}
      >
        <ViewHeaderTitle>Settings</ViewHeaderTitle>
      </ViewHeader>

      <TabBar className="px-8">
        {TABS.map(({ href, label, icon: Icon }) => (
          <TabLink
            key={href}
            href={href}
            active={pathname === href}
            icon={<Icon size={13} strokeWidth={1.5} />}
            label={label}
          />
        ))}
      </TabBar>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl">
          {children}
        </div>
      </div>
    </div>
  );
}
