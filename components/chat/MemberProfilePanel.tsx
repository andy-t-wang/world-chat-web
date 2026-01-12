"use client";

import { useState, useCallback } from "react";
import { X, MessageCircle, Loader2, Pencil } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { useDisplayName } from "@/hooks/useDisplayName";
import { customNicknamesAtom } from "@/stores/nicknames";
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
  const { displayName, worldName, profilePicture, customNickname, hasCustomNickname } = useDisplayName(address);
  const setCustomNicknames = useSetAtom(customNicknamesAtom);
  const [isStartingDm, setIsStartingDm] = useState(false);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(customNickname || "");

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const name = displayName || shortAddress;
  const isVerified = Boolean(profilePicture);

  // Save nickname
  const handleSaveNickname = useCallback(() => {
    const trimmed = nicknameInput.trim();
    const normalizedAddress = address.toLowerCase();

    if (trimmed) {
      setCustomNicknames((prev) => ({
        ...prev,
        [normalizedAddress]: trimmed,
      }));
    } else {
      // Remove nickname if empty
      setCustomNicknames((prev) => {
        const next = { ...prev };
        delete next[normalizedAddress];
        return next;
      });
    }
    setIsEditingNickname(false);
  }, [address, nicknameInput, setCustomNicknames]);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setNicknameInput(customNickname || "");
    setIsEditingNickname(false);
  }, [customNickname]);

  // Start editing
  const handleStartEdit = useCallback(() => {
    setNicknameInput(customNickname || "");
    setIsEditingNickname(true);
  }, [customNickname]);

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
    <div className="w-[320px] shrink-0 h-full bg-[var(--bg-primary)] border-l border-[var(--border-subtle)] flex flex-col">
      {/* Header */}
      <div className="shrink-0 h-16 px-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
        <span className="text-[17px] font-semibold text-[var(--text-primary)]">
          Profile
        </span>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg-hover)] transition-colors"
        >
          <X className="w-5 h-5 text-[var(--text-quaternary)]" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile Section */}
        <div className="flex flex-col items-center pt-8 pb-6 px-4">
          {/* Large avatar */}
          <Avatar address={address} size="xl" />

          {/* Name & Nickname editing */}
          {isEditingNickname ? (
            <div className="flex flex-col items-center gap-2 mt-4 w-full max-w-[200px]">
              <input
                type="text"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder="Enter nickname"
                autoFocus
                className="w-full px-3 py-2 text-center text-[17px] bg-[var(--bg-tertiary)] rounded-lg border-none outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/30"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveNickname();
                  if (e.key === "Escape") handleCancelEdit();
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveNickname}
                  className="px-3 py-1.5 text-[13px] font-medium text-[var(--text-inverse)] bg-[var(--text-primary)] rounded-lg hover:opacity-90 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Display name with edit button */}
              <div className="flex items-center gap-1.5 mt-4">
                <h2 className="text-[22px] font-semibold text-[var(--text-primary)] text-center">
                  {name}
                </h2>
                <button
                  onClick={handleStartEdit}
                  className="p-1 rounded-md hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                  title="Edit nickname"
                >
                  <Pencil className="w-4 h-4 text-[var(--text-quaternary)]" />
                </button>
              </div>

              {/* World username - show below if we have a custom nickname */}
              {hasCustomNickname && worldName && (
                <span className="text-[15px] text-[var(--text-quaternary)] mt-0.5">
                  @{worldName.toLowerCase().replace(/\s+/g, "")}
                </span>
              )}

              {/* Username - show if no custom nickname but has a world username */}
              {!hasCustomNickname && worldName && worldName !== shortAddress && (
                <span className="text-[15px] text-[var(--text-quaternary)] mt-0.5">
                  @{worldName.toLowerCase().replace(/\s+/g, "")}
                </span>
              )}

              {/* Verification badge - show below name */}
              {isVerified && (
                <div className="flex items-center gap-1.5 mt-2">
                  <VerificationBadge size="sm" />
                  <span className="text-[14px] text-[var(--text-secondary)]">Verified human</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Message Button */}
        {!isOwnProfile && (
          <div className="px-4 pb-6">
            <button
              onClick={handleMessageUser}
              disabled={isStartingDm}
              className="w-full h-10 flex items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] text-[14px] font-medium text-[var(--text-inverse)] hover:opacity-90 transition-colors disabled:opacity-50 cursor-pointer"
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
