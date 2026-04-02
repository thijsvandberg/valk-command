"use client";

import ChatLayout from "@/components/chat/ChatLayout";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export default function ChatPage() {
  return (
    <ErrorBoundary>
      <ChatLayout />
    </ErrorBoundary>
  );
}
