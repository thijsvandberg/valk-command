"use client";

import { ChatInput } from "@/components/shared/ChatInput";

interface MessageInputProps {
  onSend: (content: string) => Promise<boolean>;
  disabled?: boolean;
  onCancel?: () => void;
}

export default function MessageInput({ onSend, disabled, onCancel }: MessageInputProps) {
  return (
    <ChatInput
      onSend={onSend}
      disabled={disabled}
      onCancel={onCancel}
      placeholder="Send a message..."
      ariaLabel="Message input"
      sendAriaLabel="Send message"
      testId="message-input"
    />
  );
}
