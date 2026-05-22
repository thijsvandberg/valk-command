"use client";

import { ChatInput } from "@/components/shared/ChatInput";

interface MessageInputProps {
  onSend: (content: string) => Promise<boolean>;
  disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  return (
    <ChatInput
      onSend={onSend}
      disabled={disabled}
      placeholder="Send a message..."
      ariaLabel="Message input"
      sendAriaLabel="Send message"
      testId="message-input"
    />
  );
}
