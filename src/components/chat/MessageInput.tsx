"use client";

import { useState } from "react";
import { ChatInput, useChatInputFill } from "@/components/shared/ChatInput";
import { ModelSelector, CodebaseToggle, QuickActionsPopover } from "@/components/shared/chat-controls";
import { CHAT_QUICK_ACTIONS } from "./chat-quick-actions";

interface MessageInputProps {
  onSend: (content: string) => Promise<boolean>;
  disabled?: boolean;
  onCancel?: () => void;
  model: string;
  onModelChange: (model: string) => void;
  codebaseResearch: boolean;
  onCodebaseResearchChange: (enabled: boolean) => void;
}

export default function MessageInput({
  onSend,
  disabled,
  onCancel,
  model,
  onModelChange,
  codebaseResearch,
  onCodebaseResearchChange,
}: MessageInputProps) {
  const { pendingInput, fillInput, onPendingInputConsumed } = useChatInputFill();
  const [showActions, setShowActions] = useState(false);

  return (
    <ChatInput
      onSend={onSend}
      disabled={disabled}
      onCancel={onCancel}
      resizable
      placeholder="Send a message..."
      ariaLabel="Message input"
      sendAriaLabel="Send message"
      testId="message-input"
      contentClassName="mx-auto w-full max-w-3xl"
      pendingInput={pendingInput}
      onPendingInputConsumed={onPendingInputConsumed}
      footerLeftSlot={
        <QuickActionsPopover
          actions={CHAT_QUICK_ACTIONS}
          onSelect={(prompt) => {
            setShowActions(false);
            fillInput(prompt);
          }}
          open={showActions}
          onToggle={() => setShowActions((v) => !v)}
          onClose={() => setShowActions(false)}
          disabled={disabled ?? false}
        />
      }
      footerRightSlot={
        <>
          <ModelSelector model={model} onModelChange={onModelChange} disabled={disabled} />
          <CodebaseToggle
            enabled={codebaseResearch}
            onChange={onCodebaseResearchChange}
            disabled={disabled}
          />
        </>
      }
    />
  );
}
