"use client";

import { useState, useCallback } from "react";
import { X, MessageCircle, Loader2 } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { useUsername } from "@/hooks/useUsername";
import { xmtpClientAtom } from "@/stores/client";
import { selectedConversationIdAtom } from "@/stores/ui";
import { streamManager } from "@/lib/xmtp/StreamManager";

interface MemberProfilePanelProps {
  address: string;
  inboxId: string;
  onClose: () => void;
}

export function MemberProfilePanel({
  address,
  inboxId,
  onClose,
}: MemberProfilePanelProps) {
  const client = useAtomValue(xmtpClientAtom);
  const setSelectedConversationId = useSetAtom(selectedConversationIdAtom);
  const { displayName, profilePicture } = useUsername(address);
  const [isStartingDm, setIsStartingDm] = useState(false);

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const name = displayName || shortAddress;
  const isVerified = Boolean(profilePicture);

  // Check if this is the current user
  const isOwnProfile = client?.inboxId === inboxId;

  // Handle starting/going to DM
  const handleMessageUser = useCallback(async () => {
    if (!client || isOwnProfile) return;

    setIsStartingDm(true);

    try {
      // Check if we already have a DM with this person
      const allMetadata = streamManager.getAllConversationMetadata();
      let existingDmId: string | null = null;

      for (const [id, metadata] of allMetadata) {
        if (
          metadata.conversationType === "dm" &&
          metadata.peerInboxId === inboxId
        ) {
          existingDmId = id;
          break;
        }
      }

      if (existingDmId) {
        // Go to existing DM
        setSelectedConversationId(existingDmId);
        onClose();
      } else {
        // Create new DM
        const conversation = await client.conversations.newDmWithIdentifier({
          identifier: address.toLowerCase(),
          identifierKind: "Ethereum",
        });

        if (conversation) {
          // Register the new conversation so it appears in the list
          await streamManager.registerNewConversation(conversation);
          setSelectedConversationId(conversation.id);
          onClose();
        }
      }
    } catch (error) {
      console.error("Failed to start DM:", error);
    } finally {
      setIsStartingDm(false);
    }
  }, [
    client,
    inboxId,
    address,
    isOwnProfile,
    setSelectedConversationId,
    onClose,
  ]);

  return (
    <div className="w-[320px] shrink-0 h-full bg-white border-l border-[#E5E5EA] flex flex-col">
      {/* Header */}
      <div className="shrink-0 h-16 px-4 flex items-center justify-between border-b border-[#E5E5EA]">
        <span className="text-[17px] font-semibold text-[#1D1D1F]">
          Profile
        </span>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F2F7] transition-colors"
        >
          <X className="w-5 h-5 text-[#86868B]" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile Section */}
        <div className="flex flex-col items-center pt-8 pb-6 px-4">
          {/* Large avatar */}
          <Avatar address={address} size="xl" />

          {/* Name */}
          <div className="flex items-center gap-1.5 mt-4">
            <h2 className="text-[22px] font-semibold text-[#1D1D1F] text-center">
              {name}
            </h2>
            {isVerified && <VerificationBadge size="sm" />}
          </div>

          {/* Username */}
          {displayName && (
            <span className="text-[15px] text-[#86868B] mt-0.5">
              @{displayName.toLowerCase().replace(/\s+/g, "")}
            </span>
          )}
        </div>

        {/* Message Button */}
        {!isOwnProfile && (
          <div className="px-4 pb-6">
            <button
              onClick={handleMessageUser}
              disabled={isStartingDm}
              className="w-full h-10 flex items-center justify-center gap-2 rounded-full bg-[#1D1D1F] text-[14px] font-medium text-white hover:bg-[#2D2D2F] transition-colors disabled:opacity-50"
            >
              {isStartingDm ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <MessageCircle className="w-4 h-4" />
                  Message
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
