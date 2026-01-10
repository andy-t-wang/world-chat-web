"use client";

import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAtomValue, useSetAtom } from "jotai";
import { ArrowLeft, Search, SearchX, Check, X, Loader2 } from "lucide-react";
import {
  ConversationItem,
  type ConversationItemProps,
} from "./ConversationItem";
import {
  selectedConversationIdAtom,
  showMessageRequestsAtom,
} from "@/stores/ui";
import { VIRTUALIZATION } from "@/config/constants";
import { useMessageRequests } from "@/hooks/useConversations";
import { getCachedUsername } from "@/lib/username/service";
import { streamManager } from "@/lib/xmtp/StreamManager";

interface MessageRequestsViewProps {
  onBack: () => void;
}

export function MessageRequestsView({ onBack }: MessageRequestsViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const selectedId = useAtomValue(selectedConversationIdAtom);
  const setSelectedId = useSetAtom(selectedConversationIdAtom);

  // Use message requests hook
  const { requestIds, metadata, requestCount, isNewRequest } =
    useMessageRequests();

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const hasSelection = selectedIds.size > 0;

  // Track username cache for search
  const [usernameCacheVersion, setUsernameCacheVersion] = useState(0);

  // Refresh username cache periodically when searching
  useEffect(() => {
    if (!searchQuery) return;
    const interval = setInterval(() => {
      setUsernameCacheVersion((v) => v + 1);
    }, 500);
    return () => clearInterval(interval);
  }, [searchQuery]);

  // Filter conversations based on search query
  const filteredIds = useMemo(() => {
    if (!searchQuery.trim()) return requestIds;

    const query = searchQuery.toLowerCase().trim();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _version = usernameCacheVersion; // Dependency to trigger re-filter

    return requestIds.filter((id) => {
      const data = metadata.get(id);
      if (!data) return false;

      // For groups, search by group name
      if (data.conversationType === "group") {
        const groupName = data.groupName?.toLowerCase() ?? "";
        return groupName.includes(query);
      }

      // For DMs, search by username (from cache) or address
      if (data.peerAddress) {
        const address = data.peerAddress.toLowerCase();
        if (address.includes(query)) return true;

        const cached = getCachedUsername(data.peerAddress);
        if (cached?.username?.toLowerCase().includes(query)) return true;
      }

      return false;
    });
  }, [requestIds, metadata, searchQuery, usernameCacheVersion]);

  // Check if all filtered items are selected
  const allSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  // Toggle individual selection with shift-click support
  const toggleSelect = useCallback(
    (id: string, index: number, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);

        // Shift-click: select range from last clicked to current
        if (shiftKey && lastClickedIndex !== null) {
          const start = Math.min(lastClickedIndex, index);
          const end = Math.max(lastClickedIndex, index);
          for (let i = start; i <= end; i++) {
            next.add(filteredIds[i]);
          }
        } else {
          // Normal click: toggle single item
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
        }

        return next;
      });
      setLastClickedIndex(index);
    },
    [lastClickedIndex, filteredIds]
  );

  // Select/deselect all
  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIds));
    }
  }, [allSelected, filteredIds]);

  // Clear selection and exit select mode
  const exitSelectMode = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelectMode(false);
    setLastClickedIndex(null);
  }, []);

  // Accept selected requests
  const acceptSelected = useCallback(async () => {
    if (selectedIds.size === 0 || isProcessing) return;

    setIsProcessing(true);
    const idsToProcess = Array.from(selectedIds);

    try {
      await Promise.all(
        idsToProcess.map((id) => streamManager.acceptConversation(id))
      );
      exitSelectMode();
    } catch (error) {
      console.error("Failed to accept requests:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, isProcessing, exitSelectMode]);

  // Reject selected requests
  const rejectSelected = useCallback(async () => {
    if (selectedIds.size === 0 || isProcessing) return;

    setIsProcessing(true);
    const idsToProcess = Array.from(selectedIds);

    try {
      await Promise.all(
        idsToProcess.map((id) => streamManager.rejectConversation(id))
      );
      exitSelectMode();
    } catch (error) {
      console.error("Failed to reject requests:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, isProcessing, exitSelectMode]);

  // Format timestamp for display
  const formatTimestamp = (ns: bigint): string => {
    if (ns === BigInt(0)) return "";
    const date = new Date(Number(ns / BigInt(1_000_000)));
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  // Build conversation props from data
  const getConversationProps = (id: string): ConversationItemProps | null => {
    const data = metadata.get(id);
    if (!data) return null;

    const baseProps = {
      id: data.id,
      conversationType: data.conversationType,
      lastMessage: data.lastMessagePreview ?? undefined,
      timestamp: formatTimestamp(data.lastActivityNs),
      unreadCount: data.unreadCount ?? 0,
      isNewRequest: isNewRequest(id),
    };

    if (data.conversationType === "group") {
      return {
        ...baseProps,
        groupName: data.groupName,
        memberCount: data.memberCount,
        memberPreviews: data.memberPreviews,
        avatarUrl: data.groupImageUrl,
      };
    }

    return {
      ...baseProps,
      peerAddress: data.peerAddress,
    };
  };

  const virtualizer = useVirtualizer({
    count: filteredIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUALIZATION.CONVERSATION_ITEM_HEIGHT,
    overscan: VIRTUALIZATION.OVERSCAN_COUNT,
  });

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="shrink-0 px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Back to chats"
          >
            <ArrowLeft className="w-5 h-5 text-[#181818]" />
          </button>
          <h1 className="text-lg font-semibold text-[#181818]">
            Message Requests
          </h1>
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-4 py-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9BA3AE]" />
          <input
            type="text"
            placeholder="Search requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[#F5F5F5] rounded-lg text-sm text-[#181818] placeholder:text-[#9BA3AE] focus:outline-none focus:ring-2 focus:ring-[#005CFF]/20"
          />
        </div>
      </div>

      {/* Selection Bar - shows when in select mode or as a button to enter select mode */}
      {filteredIds.length > 0 && (
        <div className="shrink-0 px-4 py-2 border-b border-gray-100">
          {isSelectMode ? (
            <div className="flex flex-col gap-2">
              {/* First row: Select all and Cancel */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-[#005CFF] focus:ring-[#005CFF]/20"
                  />
                  <span className="text-sm text-[#717680]">
                    {allSelected ? "Deselect all" : "Select all"}
                  </span>
                </label>
                <button
                  onClick={exitSelectMode}
                  className="px-3 py-1.5 rounded-lg text-sm text-[#717680] hover:bg-[#F5F5F5] transition-colors"
                >
                  Cancel
                </button>
              </div>

              {/* Second row: Selection count and action buttons */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#717680]">
                  {hasSelection
                    ? `${selectedIds.size} selected`
                    : "None selected"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={acceptSelected}
                    disabled={isProcessing || !hasSelection}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D1D1F] text-white text-sm font-medium hover:bg-[#2D2D2F] transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Accept
                  </button>
                  <button
                    onClick={rejectSelected}
                    disabled={isProcessing || !hasSelection}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E5EA] bg-white text-[#1D1D1F] text-sm font-medium hover:bg-[#F5F5F5] transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#717680]">
                {filteredIds.length}{" "}
                {filteredIds.length === 1 ? "request" : "requests"}
              </span>
              <button
                onClick={() => setIsSelectMode(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-[#005CFF] hover:bg-[#005CFF]/10 transition-colors"
              >
                Select
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty state - no requests */}
      {requestCount === 0 && (
        <div className="flex flex-col flex-1 justify-center px-6">
          <p className="text-[#717680]">No message requests</p>
          <p className="text-sm text-[#9BA3AE] mt-1">
            When someone new messages you, they&apos;ll appear here
          </p>
        </div>
      )}

      {/* No search results */}
      {requestCount > 0 && searchQuery && filteredIds.length === 0 && (
        <div className="flex flex-col flex-1 justify-center px-6">
          <SearchX className="w-10 h-10 text-[#9BA3AE] mb-3" />
          <p className="text-[#717680]">No results found</p>
          <p className="text-sm text-[#9BA3AE] mt-1">
            Try a different search term
          </p>
        </div>
      )}

      {/* Virtualized Request List */}
      {filteredIds.length > 0 && (
        <div
          ref={parentRef}
          className="flex-1 overflow-auto scrollbar-auto-hide"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const id = filteredIds[virtualRow.index];
              const props = getConversationProps(id);

              if (!props) {
                return (
                  <div
                    key={id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex items-center px-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
                    <div className="ml-3 flex-1">
                      <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                      <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mt-1" />
                    </div>
                  </div>
                );
              }

              const isChecked = selectedIds.has(id);
              const rowIndex = virtualRow.index;

              return (
                <div
                  key={id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-center"
                >
                  {/* Checkbox - only show in select mode */}
                  {isSelectMode && (
                    <div className="pl-4 pr-1 flex items-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onClick={(e) => toggleSelect(id, rowIndex, e.shiftKey)}
                        onChange={() => {}} // Controlled by onClick for shift-click support
                        className="w-4 h-4 rounded border-gray-300 text-[#005CFF] focus:ring-[#005CFF]/20 cursor-pointer"
                      />
                    </div>
                  )}
                  {/* Conversation item */}
                  <div className="flex-1 min-w-0">
                    <ConversationItem
                      {...props}
                      isSelected={selectedId === id}
                      onClick={() => setSelectedId(id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
