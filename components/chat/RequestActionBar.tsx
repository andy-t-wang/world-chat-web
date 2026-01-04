"use client";

import { useState } from "react";
import { useSetAtom } from "jotai";
import { Loader2, AlertTriangle, Check, X } from "lucide-react";
import { streamManager } from "@/lib/xmtp/StreamManager";
import { selectedConversationIdAtom } from "@/stores/ui";

interface RequestActionBarProps {
  conversationId: string;
  peerAddress?: string;
}

/**
 * Compact banner for message requests - appears at top of conversation
 */
export function MessageRequestBanner({
  conversationId,
}: RequestActionBarProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const setSelectedId = useSetAtom(selectedConversationIdAtom);

  const handleAccept = async () => {
    if (isAccepting || isDeleting) return;
    setIsAccepting(true);

    try {
      await streamManager.acceptConversation(conversationId);
    } catch (error) {
      console.error("Failed to accept conversation:", error);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDelete = async () => {
    if (isAccepting || isDeleting) return;
    setIsDeleting(true);

    try {
      const success = await streamManager.rejectConversation(conversationId);
      if (success) {
        setSelectedId(null);
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const isLoading = isAccepting || isDeleting;

  return (
    <div className="shrink-0 px-4 py-3 border-b border-[#E5E5EA] bg-[#FAFAFA]">
      <div className="flex items-center justify-between gap-4">
        {/* Text */}
        <p className="text-[14px] text-[#86868B]">
          <span className="font-medium text-[#1D1D1F]">Message request</span>
          <span className="mx-2">·</span>
          <span>Accept to start chatting</span>
        </p>

        {/* Action buttons */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleDelete}
            disabled={isLoading}
            className="h-9 px-4 flex items-center justify-center gap-2 rounded-full border border-[#E5E5EA] text-[#1D1D1F] text-[14px] font-medium hover:bg-[#F5F5F5] hover:border-[#D1D1D6] transition-colors disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            Delete
          </button>
          <button
            onClick={handleAccept}
            disabled={isLoading}
            className="h-9 px-4 flex items-center justify-center gap-2 rounded-full bg-[#1D1D1F] text-white text-[14px] font-medium hover:bg-[#2D2D2F] transition-colors disabled:opacity-50"
          >
            {isAccepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

// Keep old export for backwards compatibility
export function RequestActionBar(props: RequestActionBarProps) {
  return <MessageRequestBanner {...props} />;
}
