"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import {
  slashPluginKey,
  registerSlashCallbacks,
  unregisterSlashCallbacks,
  type SlashPluginState,
} from "./slash-command-extension";
import { SLASH_COMMANDS, slashCommandFuse, type SlashCommand } from "./slash-command-list";
import { useRecentCommands } from "./use-recent-commands";

interface Props {
  editor: Editor | null;
}

// Active index state tracks the query it was set for so we can auto-reset to 0
// when the query changes — without using a separate state update effect.
interface ActiveState {
  idx: number;
  forQuery: string;
}

export function SlashCommandMenu({ editor }: Props) {
  const [pluginState, setPluginState] = useState<SlashPluginState>({
    active: false,
    from: 0,
    to: 0,
    query: "",
  });
  const [dismissedFrom, setDismissedFrom] = useState<number | null>(null);
  const [activeState, setActiveState] = useState<ActiveState>({ idx: 0, forQuery: "" });
  const { recentIds, trackUsage } = useRecentCommands();

  // Refs for use inside stable callbacks — updated in an effect after each render
  const pluginStateRef = useRef(pluginState);
  const filteredCommandsRef = useRef<SlashCommand[]>([]);
  const activeIdxRef = useRef(0);
  const executeCommandRef = useRef<((cmd: SlashCommand) => void) | null>(null);

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const filteredCommands = getFilteredCommands(pluginState.query, recentIds);

  // Effective active index: auto-reset to 0 when query changes (no effect needed)
  const activeIdx =
    activeState.forQuery === pluginState.query ? activeState.idx : 0;

  // Compute floating menu position during render (coordsAtPos is a DOM read, safe here
  // because the editor DOM is updated before React re-renders from transaction events)
  const position = useMemo(() => {
    if (!editor || !pluginState.active) return null;
    try {
      const coords = editor.view.coordsAtPos(pluginState.from);
      const menuEstimatedHeight = 300;
      const spaceBelow = window.innerHeight - coords.bottom;
      const top =
        spaceBelow < menuEstimatedHeight
          ? coords.top - menuEstimatedHeight - 4
          : coords.bottom + 4;
      return { top, left: coords.left };
    } catch {
      return null;
    }
  }, [editor, pluginState.active, pluginState.from]);

  // Sync refs after every render so event-handler callbacks use current values
  useEffect(() => {
    pluginStateRef.current = pluginState;
    filteredCommandsRef.current = filteredCommands;
    activeIdxRef.current = activeIdx;
  });

  const isVisible = pluginState.active && pluginState.from !== dismissedFrom;

  // Scroll the active item into view (DOM sync, not setState — rule allows this)
  useEffect(() => {
    if (!isVisible) return;
    itemRefs.current[activeIdx]?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, isVisible]);

  // Delete the "/query" text then run the command
  const executeCommand = useCallback(
    (cmd: SlashCommand) => {
      if (!editor) return;
      const { from, to } = pluginStateRef.current;
      editor.chain().focus().deleteRange({ from, to }).run();
      cmd.execute(editor);
      trackUsage(cmd.id);
    },
    [editor, trackUsage]
  );

  // Keep ref in sync after every render
  useEffect(() => {
    executeCommandRef.current = executeCommand;
  });

  // Subscribe to editor transactions to keep plugin state in sync
  useEffect(() => {
    if (!editor) return;

    const onTransaction = () => {
      const state = slashPluginKey.getState(editor.state);
      if (!state) return;
      // Both updates batched in React 18 → single re-render
      setPluginState(state);
      // Reset dismissal when the slash trigger position shifts to a new location
      if (state.from !== pluginStateRef.current.from) {
        setDismissedFrom(null);
      }
    };

    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor]);

  // Register keyboard callbacks via module-level WeakMap (avoids mutating the editor prop)
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    registerSlashCallbacks(dom, {
      arrowDown: () => {
        setActiveState((prev) => {
          const currentQuery = pluginStateRef.current.query;
          const baseIdx = prev.forQuery === currentQuery ? prev.idx : 0;
          const newIdx = (baseIdx + 1) % Math.max(1, filteredCommandsRef.current.length);
          return { idx: newIdx, forQuery: currentQuery };
        });
      },
      arrowUp: () => {
        setActiveState((prev) => {
          const currentQuery = pluginStateRef.current.query;
          const baseIdx = prev.forQuery === currentQuery ? prev.idx : 0;
          const len = Math.max(1, filteredCommandsRef.current.length);
          return { idx: (baseIdx - 1 + len) % len, forQuery: currentQuery };
        });
      },
      enter: () => {
        const cmd = filteredCommandsRef.current[activeIdxRef.current];
        if (!cmd || !executeCommandRef.current) return false;
        executeCommandRef.current(cmd);
        return true;
      },
      escape: () => {
        setDismissedFrom(pluginStateRef.current.from);
      },
    });

    return () => {
      unregisterSlashCallbacks(dom);
    };
  }, [editor]);

  if (!isVisible || !position || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="listbox"
      aria-label="Slash commands"
      className="slash-command-menu"
      style={{ top: position.top, left: position.left }}
    >
      <div className="slash-command-scroll">
        {filteredCommands.length === 0 ? (
          <div className="slash-command-empty">No commands match</div>
        ) : (
          filteredCommands.map((cmd, i) => (
            <CommandItem
              key={cmd.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              cmd={cmd}
              isActive={activeIdx === i}
              onMouseEnter={() =>
                setActiveState({ idx: i, forQuery: pluginState.query })
              }
              onSelect={() => executeCommand(cmd)}
            />
          ))
        )}
      </div>
    </div>,
    document.body
  );
}

interface CommandItemProps {
  cmd: SlashCommand;
  isActive: boolean;
  onMouseEnter: () => void;
  onSelect: () => void;
  ref: (el: HTMLButtonElement | null) => void;
}

function CommandItem({ cmd, isActive, onMouseEnter, onSelect, ref }: CommandItemProps) {
  const Icon = cmd.icon;
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={isActive}
      onMouseEnter={onMouseEnter}
      onMouseDown={(e) => {
        // Prevent the editor from losing focus before the command executes
        e.preventDefault();
        onSelect();
      }}
      className={`slash-command-item${isActive ? " slash-command-item--active" : ""}`}
    >
      <span className="slash-command-icon">
        <Icon size={13} strokeWidth={1.5} />
      </span>
      <span className="slash-command-label">{cmd.label}</span>
      <span className="slash-command-description">{cmd.description}</span>
    </button>
  );
}

function getFilteredCommands(query: string, recentIds: string[]): SlashCommand[] {
  if (query === "") {
    // Sort all commands: most recently used first, then alphabetical
    return SLASH_COMMANDS.slice().sort((a, b) => {
      const aIdx = recentIds.indexOf(a.id);
      const bIdx = recentIds.indexOf(b.id);
      const aScore = aIdx === -1 ? Infinity : aIdx;
      const bScore = bIdx === -1 ? Infinity : bIdx;
      return aScore - bScore;
    });
  }
  return slashCommandFuse.search(query).map((r) => r.item);
}
