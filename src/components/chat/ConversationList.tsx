"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { createPortal } from "react-dom";
import type { Conversation, ConversationType } from "@/types/chat";
import { Trash2, Filter, Search, X, ChevronRight, Pin, PanelLeftClose, PanelLeftOpen, CheckSquare, Mail, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import ConversationOverflowMenu from "./ConversationOverflowMenu";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { LoadingState } from "@/components/shared/LoadingState";
import ConversationTypePicker from "./ConversationTypePicker";
import ConversationFilterBar from "./ConversationFilterBar";
import BulkActionBar from "./BulkActionBar";
import { deriveCategory, CATEGORY_CONFIG, type ConversationCategory } from "@/lib/conversation-category";
import { groupByDate, type DateGroupLabel } from "@/lib/date-groups";

const GROUPS_COLLAPSED_KEY = "bridge:sidebar-groups-collapsed";

function readCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(GROUPS_COLLAPSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeCollapsedGroups(groups: Set<string>): void {
  try {
    localStorage.setItem(GROUPS_COLLAPSED_KEY, JSON.stringify([...groups]));
  } catch { /* ignore */ }
}

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  runningTaskConversationIds?: Set<string>;
  categoryCounts?: Record<ConversationCategory, number>;
  activeFilters?: Set<ConversationCategory>;
  onToggleFilter?: (category: ConversationCategory) => void;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  filtersVisible?: boolean;
  onToggleFiltersVisible?: () => void;
  onSelect: (id: string) => void;
  onCreate: (type: ConversationType) => void;
  onDelete: (id: string) => void;
  onTogglePin?: (id: string, pinned: boolean) => void;
  onToggleRead?: (id: string, isUnread: boolean) => void;
  multiselectActive?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onActivateMultiselect?: () => void;
  onBulkMarkRead?: () => void;
  onBulkMarkUnread?: () => void;
  onBulkDelete?: () => void;
  onBulkSelectAll?: () => void;
  onBulkDeselectAll?: () => void;
  onExitMultiselect?: () => void;
}

export default function ConversationList({
  conversations,
  activeId,
  loading,
  error,
  collapsed = false,
  onToggleCollapsed,
  runningTaskConversationIds,
  categoryCounts,
  activeFilters,
  onToggleFilter,
  onClearFilters,
  hasActiveFilters,
  filtersVisible,
  onToggleFiltersVisible,
  onSelect,
  onCreate,
  onDelete,
  onTogglePin,
  onToggleRead,
  multiselectActive = false,
  selectedIds,
  onToggleSelect,
  onActivateMultiselect,
  onBulkMarkRead,
  onBulkMarkUnread,
  onBulkDelete,
  onBulkSelectAll,
  onBulkDeselectAll,
  onExitMultiselect,
}: ConversationListProps) {
  const canShowFilterBar = categoryCounts && activeFilters && onToggleFilter && onClearFilters;
  const hasMultipleCategories = canShowFilterBar && Object.values(categoryCounts).filter((c) => c > 0).length >= 2;

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedQuery("");
    searchRef.current?.focus();
  }, []);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      clearSearch();
    }
  }, [clearSearch]);

  // Filter by search query
  const searchFiltered = useMemo(() => {
    if (!debouncedQuery) return conversations;
    const q = debouncedQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, debouncedQuery]);

  // Split pinned vs unpinned
  const pinnedConversations = useMemo(() => searchFiltered.filter((c) => c.pinned), [searchFiltered]);
  const unpinnedConversations = useMemo(() => searchFiltered.filter((c) => !c.pinned), [searchFiltered]);
  const dateGroups = useMemo(() => groupByDate(unpinnedConversations), [unpinnedConversations]);
  // Check full list (not search-filtered) so the hint doesn't flicker during search
  const hasPinnedConversations = useMemo(() => conversations.some((c) => c.pinned), [conversations]);

  // Group collapse state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(readCollapsedGroups);

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      writeCollapsedGroups(next);
      return next;
    });
  }, []);

  // Track which conversation's overflow menu is open so we can keep the trigger visible
  const [openOverflowId, setOpenOverflowId] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversationId: string; pinned: boolean; readAt: string | null } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, conversationId: conv.id, pinned: conv.pinned, readAt: conv.readAt });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  useOutsideClick(contextMenuRef, closeContextMenu, { enabled: !!contextMenu, escapeClose: false });

  const noResults = searchFiltered.length === 0 && debouncedQuery.length > 0;

  function renderConversationItem(conversation: Conversation) {
    const isActive = conversation.id === activeId;
    const hasRunningTask = runningTaskConversationIds?.has(conversation.id) ?? false;
    const isUnread = conversation.readAt === null;
    const isSelected = selectedIds?.has(conversation.id) ?? false;
    const category = deriveCategory(conversation);
    const config = CATEGORY_CONFIG[category];
    const Icon = config.icon;

    if (collapsed) {
      return (
        <li key={conversation.id} role="option" aria-selected={isActive}>
          <button
            type="button"
            onClick={() => multiselectActive && onToggleSelect ? onToggleSelect(conversation.id) : onSelect(conversation.id)}
            onContextMenu={(e) => handleContextMenu(e, conversation)}
            title={conversation.title}
            className={`relative flex h-8 w-8 items-center justify-center rounded-lg mx-auto transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              isActive
                ? "bg-[var(--color-brand-600)]/10"
                : "hover:bg-hover-list-item active:bg-overlay-default"
            }`}
          >
            <Icon
              size={15}
              strokeWidth={1.5}
              style={{ color: isActive ? config.color : undefined }}
              className={isActive ? "" : "text-text-tertiary"}
            />
            {hasRunningTask && (
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)] animate-pulse" aria-label="Task running" />
            )}
            {isUnread && !hasRunningTask && (
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" aria-label="Unread" />
            )}
            {conversation.pinned && (
              <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-warning-400)]" />
            )}
          </button>
        </li>
      );
    }

    return (
      <li key={conversation.id} role="option" aria-selected={isActive}>
        <div className="flex items-center group">
          {multiselectActive && onToggleSelect && (
            <button
              type="button"
              onClick={() => onToggleSelect(conversation.id)}
              className="shrink-0 flex items-center justify-center w-6 h-6 ml-1 cursor-pointer"
              aria-label={isSelected ? `Deselect ${conversation.title}` : `Select ${conversation.title}`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border transition-colors duration-150 ${
                isSelected
                  ? "bg-[var(--color-brand-500)] border-[var(--color-brand-500)]"
                  : "border-border-strong hover:border-[var(--color-brand-400)]"
              }`}>
                {isSelected && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => multiselectActive && onToggleSelect ? onToggleSelect(conversation.id) : onSelect(conversation.id)}
            onContextMenu={(e) => handleContextMenu(e, conversation)}
            className={`flex-1 min-w-0 rounded-lg py-2 px-2.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              isActive
                ? "bg-[var(--color-brand-600)]/10 text-text-primary border-l-2 border-[var(--color-brand-400)]"
                : "text-text-secondary border-l-2 border-transparent hover:bg-hover-list-item hover:text-text-primary active:bg-overlay-default"
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Icon
                size={13}
                strokeWidth={1.5}
                className="shrink-0"
                style={{ color: config.color }}
              />
              <span className={`block truncate font-[var(--font-body)] text-body-lg ${isUnread ? "font-semibold text-text-primary" : "font-medium"}`}>
                {conversation.title}
              </span>
              {conversation.pinned && (
                <Pin size={10} strokeWidth={1.5} className="shrink-0 text-text-muted" />
              )}
              {/* Single right-aligned status dot: running (pulsing) takes precedence over unread */}
              {hasRunningTask ? (
                <span
                  className="ml-auto shrink-0 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)] animate-pulse"
                  aria-label="Task running"
                />
              ) : isUnread ? (
                <span
                  className="ml-auto shrink-0 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]"
                  aria-label="Unread"
                />
              ) : null}
            </span>
          </button>
          {!multiselectActive && (
            <div className={`shrink-0 transition-opacity duration-150 ${
              openOverflowId === conversation.id
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
            }`}>
              <ConversationOverflowMenu
                conversationId={conversation.id}
                conversationTitle={conversation.title}
                pinned={conversation.pinned}
                isUnread={isUnread}
                onTogglePin={onTogglePin}
                onToggleRead={onToggleRead}
                onDelete={onDelete}
                onOpenChange={(open) => setOpenOverflowId(open ? conversation.id : null)}
              />
            </div>
          )}
        </div>
      </li>
    );
  }

  function renderGroupHeader(label: string, count: number) {
    const isCollapsed = collapsedGroups.has(label);
    return (
      <button
        type="button"
        onClick={() => toggleGroup(label)}
        className="sticky top-0 z-[5] flex w-full items-center gap-1.5 bg-[var(--color-surface-elevated)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted cursor-pointer hover:text-text-tertiary transition-colors duration-150"
        data-testid={`group-header-${label}`}
      >
        <ChevronRight
          size={10}
          strokeWidth={2}
          className={`shrink-0 transition-transform duration-150 ${isCollapsed ? "" : "rotate-90"}`}
        />
        <span>{label}</span>
        <span className="text-text-muted/60 ml-auto tabular-nums">{count}</span>
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface-elevated)]" data-testid="conversation-list">
      {/* Header */}
      <div className={`flex items-center ${collapsed ? "justify-center px-1 pt-3 pb-2" : "justify-between px-4 pt-4 pb-3"}`}>
        {!collapsed && (
          <h2 className="font-[var(--font-display)] text-body-lg font-semibold tracking-wide text-text-secondary">
            Conversations
          </h2>
        )}
        <div className={`flex items-center ${collapsed ? "flex-col gap-1.5" : "gap-1"}`}>
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary cursor-pointer hover:bg-hover-interactive hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              data-testid="sidebar-collapse-toggle"
            >
              {collapsed ? <PanelLeftOpen size={14} strokeWidth={1.5} /> : <PanelLeftClose size={14} strokeWidth={1.5} />}
            </button>
          )}
          {!collapsed && hasMultipleCategories && onToggleFiltersVisible && (
            <button
              type="button"
              onClick={onToggleFiltersVisible}
              className="relative flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary cursor-pointer hover:bg-hover-interactive hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              aria-label="Toggle filters"
              data-testid="filter-toggle"
            >
              <Filter size={14} strokeWidth={1.5} />
              {hasActiveFilters && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--color-brand-400)]" />
              )}
            </button>
          )}
          {!collapsed && onActivateMultiselect && (
            <button
              type="button"
              onClick={onActivateMultiselect}
              className={`flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                multiselectActive
                  ? "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
                  : "text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary"
              }`}
              aria-label={multiselectActive ? "Exit multiselect" : "Select multiple"}
              data-testid="multiselect-toggle"
            >
              <CheckSquare size={14} strokeWidth={1.5} />
            </button>
          )}
          {!collapsed && <ConversationTypePicker onCreate={onCreate} />}
          {collapsed && (
            <ConversationTypePicker onCreate={onCreate} collapsed />
          )}
        </div>
      </div>

      {/* Search (expanded mode only) */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search size={13} strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search conversations..."
              className="w-full rounded-md border border-border-default bg-[var(--color-surface-base)] py-1.5 pl-8 pr-7 text-body-sm text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-400)]/40 focus:outline-none transition-colors duration-150"
              aria-label="Search conversations"
              data-testid="conversation-search"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted cursor-pointer hover:text-text-secondary transition-colors duration-150"
                aria-label="Clear search"
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            )}
          </div>
          {/* Pin hint when no conversations are pinned */}
          {!hasPinnedConversations && conversations.length > 0 && (
            <p
              className="mt-1.5 text-[10px] leading-tight text-text-muted"
              data-testid="pin-hint"
            >
              Right-click or use the menu to pin conversations
            </p>
          )}
        </div>
      )}

      {/* Filter bar */}
      {!collapsed && canShowFilterBar && filtersVisible && (
        <ConversationFilterBar
          categoryCounts={categoryCounts}
          activeFilters={activeFilters}
          onToggle={onToggleFilter}
          onClearAll={onClearFilters}
        />
      )}

      {error && (
        <InlineAlert variant="error" className="mx-4 mb-2 text-body-sm">
          {error}
        </InlineAlert>
      )}

      {loading && conversations.length === 0 ? (
        <LoadingState className="py-8" />
      ) : noResults ? (
        <EmptyState
          title="No results"
          className="px-2 py-8"
        />
      ) : searchFiltered.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matching conversations" : "No conversations yet"}
          className="px-2 py-8"
        />
      ) : (
        <ul
          className={`flex-1 overflow-y-auto pb-2 ${collapsed ? "px-1 space-y-1" : "px-2 space-y-0.5"}`}
          role="listbox"
          aria-label="Conversation list"
        >
          {/* Pinned section */}
          {pinnedConversations.length > 0 && (
            <>
              {!collapsed && renderGroupHeader("Pinned", pinnedConversations.length)}
              {(!collapsedGroups.has("Pinned") || collapsed) && pinnedConversations.map(renderConversationItem)}
            </>
          )}

          {/* Date groups */}
          {dateGroups.map((group) => (
            <li key={group.label} className="list-none" role="presentation">
              {!collapsed && renderGroupHeader(group.label, group.conversations.length)}
              {(!collapsedGroups.has(group.label) || collapsed) && (
                <ul className="space-y-0.5" role="presentation">
                  {group.conversations.map(renderConversationItem)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Context menu - portal to body to avoid transform containing block in sidebar */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-[100] min-w-[160px] rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-testid="conversation-context-menu"
        >
          {onTogglePin && (
            <button
              type="button"
              onClick={() => {
                onTogglePin(contextMenu.conversationId, !contextMenu.pinned);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item hover:text-text-primary transition-colors duration-150"
            >
              <Pin size={12} strokeWidth={1.5} />
              {contextMenu.pinned ? "Unpin conversation" : "Pin conversation"}
            </button>
          )}
          {onToggleRead && (
            <button
              type="button"
              onClick={() => {
                onToggleRead(contextMenu.conversationId, contextMenu.readAt === null);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item hover:text-text-primary transition-colors duration-150"
              data-testid="context-menu-toggle-read"
            >
              {contextMenu.readAt === null ? (
                <>
                  <MailOpen size={12} strokeWidth={1.5} />
                  Mark as read
                </>
              ) : (
                <>
                  <Mail size={12} strokeWidth={1.5} />
                  Mark as unread
                </>
              )}
            </button>
          )}
          {(onTogglePin || onToggleRead) && (
            <div className="my-1 border-t border-border-default" />
          )}
          <button
            type="button"
            onClick={() => {
              onDelete(contextMenu.conversationId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-body-sm text-[var(--color-danger-400)] cursor-pointer hover:bg-hover-list-item hover:text-[var(--color-danger-300)] transition-colors duration-150"
            data-testid="context-menu-delete"
          >
            <Trash2 size={12} strokeWidth={1.5} />
            Delete conversation
          </button>
        </div>,
        document.body,
      )}

      {/* Bulk action bar */}
      {multiselectActive && !collapsed && onBulkMarkRead && onBulkMarkUnread && onBulkDelete && onBulkSelectAll && onBulkDeselectAll && onExitMultiselect && (
        <BulkActionBar
          selectedCount={selectedIds?.size ?? 0}
          totalCount={searchFiltered.length}
          allSelected={(selectedIds?.size ?? 0) === searchFiltered.length && searchFiltered.length > 0}
          onSelectAll={onBulkSelectAll}
          onDeselectAll={onBulkDeselectAll}
          onMarkRead={onBulkMarkRead}
          onMarkUnread={onBulkMarkUnread}
          onDelete={onBulkDelete}
          onExit={onExitMultiselect}
        />
      )}
    </div>
  );
}
