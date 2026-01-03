"use client";

import { useState } from "react";
import { useSetAtom } from "jotai";
import { Loader2 } from "lucide-react";
import { streamManager } from "@/lib/xmtp/StreamManager";
import { selectedConversationIdAtom } from "@/stores/ui";
import { useUsername } from "@/hooks/useUsername";

interface RequestActionBarProps {
  conversationId: string;
  peerAddress?: string;
}

export function RequestActionBar({
  conversationId,
  peerAddress,
}: RequestActionBarProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const setSelectedId = useSetAtom(selectedConversationIdAtom);
  const { displayName } = useUsername(peerAddress);

  const senderName =
    displayName ||
    (peerAddress
      ? `${peerAddress.slice(0, 6)}...${peerAddress.slice(-4)}`
      : "this user");

  const handleAccept = async () => {
    if (isAccepting || isDeleting) return;
    setIsAccepting(true);

    try {
      const success = await streamManager.acceptConversation(conversationId);
      if (success) {
        // Stay on the conversation - it's now accepted
        // The UI will automatically switch to showing the regular input
      }
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
        // Clear selection and go back to requests view
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
    <div className="shrink-0 bg-white pb-4">
      {/* Warning text */}
      <div className="px-6 py-3">
        <p className="text-[14px] text-[#717680] text-center leading-[1.4]">
          You have received a message from @{senderName}. This could be a spam
          or phishing attempt. Only accept the message if you trust the sender.
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 px-6">
        {/* Delete Button */}
        <button
          onClick={handleDelete}
          disabled={isLoading}
          className="flex-1 h-11 flex items-center justify-center gap-2 border border-[#EBECEF] text-[#181818] font-medium text-[15px] rounded-full hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Delete
        </button>

        {/* Accept Button */}
        <button
          onClick={handleAccept}
          disabled={isLoading}
          className="flex-1 h-11 flex items-center justify-center gap-2 bg-[#181818] text-white font-medium text-[15px] rounded-full hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAccepting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Accept
        </button>
      </div>
    </div>
  );
}
