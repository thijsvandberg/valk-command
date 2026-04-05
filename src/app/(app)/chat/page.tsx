"use client";

import ChatLayout from "@/components/chat/ChatLayout";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function ChatPage() {
  const pageTitle = usePageTitle("Chat");
  return (
    <>
      {pageTitle}
      <ErrorBoundary>
        <ChatLayout />
      </ErrorBoundary>
    </>
  );
}
