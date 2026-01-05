"use client";

import { useEffect, useState, memo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAtomValue } from "jotai";
import { Sidebar, MessagePanel, EmptyState, GroupDetailsPanel, MemberProfilePanel } from "@/components/chat";
import { NewConversationModal } from "@/components/chat/NewConversationModal";
import { selectedConversationIdAtom } from "@/stores/ui";
import { clientStateAtom } from "@/stores/client";
import { xmtpClientAtom } from "@/stores/client";
import { useConversationMetadata, useIsMessageRequest } from "@/hooks/useConversations";
import { useQRXmtpClient } from "@/hooks/useQRXmtpClient";
import { useUsername } from "@/hooks/useUsername";
import { useGroupMemberVerification } from "@/hooks/useGroupMemberVerification";
import { hasQRSession } from "@/lib/auth/session";
import { setCurrentChatName } from "@/lib/notifications";
import { streamManager } from "@/lib/xmtp/StreamManager";
import { Loader2, MessageCircle, AlertCircle, Monitor } from "lucide-react";

// Memoized MessagePanel wrapper to prevent unnecessary re-renders
const MemoizedMessagePanel = memo(MessagePanel);

export default function ChatPage() {
  const router = useRouter();
  const clientState = useAtomValue(clientStateAtom);
  const client = useAtomValue(xmtpClientAtom);
  const { restoreSession } = useQRXmtpClient();
  const selectedId = useAtomValue(selectedConversationIdAtom);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restorationAttempted, setRestorationAttempted] = useState(false);
  const [restorationFailed, setRestorationFailed] = useState(false);
  const [isLockedByOtherTab, setIsLockedByOtherTab] = useState(false);
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<{
    address: string;
    inboxId: string;
  } | null>(null);
  const restorationRef = useRef(false);

  const hasXmtpClient = clientState.client !== null;

  // Get conversation metadata from StreamManager (no loading needed)
  const conversationMetadata = useConversationMetadata(selectedId);
  const isMessageRequest = useIsMessageRequest(selectedId);

  // Check if peer is verified (has profile picture = World ID verified) for DMs
  // - Profile picture present → verified human
  // - Username but no profile picture → unverified
  // - Resolution failed (no record) → not verified
  const peerAddress = conversationMetadata?.conversationType === 'dm' ? conversationMetadata.peerAddress : null;
  const { record: peerRecord, displayName: peerDisplayName } = useUsername(peerAddress);
  const isPeerVerified = Boolean(peerRecord?.profile_picture_url || peerRecord?.minimized_profile_picture_url);

  // Update browser tab title with current chat name
  useEffect(() => {
    if (!selectedId || !conversationMetadata) {
      setCurrentChatName(null);
      return;
    }

    if (conversationMetadata.conversationType === 'group') {
      setCurrentChatName(conversationMetadata.groupName || 'Group Chat');
    } else {
      // For DMs, use the peer's display name
      const chatName = peerDisplayName || (peerAddress ? `${peerAddress.slice(0, 6)}...${peerAddress.slice(-4)}` : 'Chat');
      setCurrentChatName(chatName);
    }
  }, [selectedId, conversationMetadata, peerDisplayName, peerAddress]);

  // Get group member verification stats
  const groupMemberPreviews = conversationMetadata?.conversationType === 'group' ? conversationMetadata.memberPreviews : undefined;
  const { verifiedCount, unverifiedCount } = useGroupMemberVerification(groupMemberPreviews);
  // Group is considered verified only if all members are verified
  const isGroupVerified = verifiedCount > 0 && unverifiedCount === 0;

  // Close side panels when conversation changes
  useEffect(() => {
    setShowGroupDetails(false);
    setSelectedMemberProfile(null);
  }, [selectedId]);

  // Handle member avatar click in group chat
  const handleMemberAvatarClick = useCallback((address: string, inboxId: string) => {
    setShowGroupDetails(false); // Close group details if open
    setSelectedMemberProfile({ address, inboxId });
  }, []);

  // Handle leave group
  const handleLeaveGroup = useCallback(async () => {
    if (!client || !client.inboxId || !selectedId || isLeavingGroup) return;
    if (conversationMetadata?.conversationType !== 'group') return;

    setIsLeavingGroup(true);
    setShowGroupDetails(false);

    try {
      const conversation = await client.conversations.getConversationById(selectedId);
      if (conversation && 'removeMembers' in conversation) {
        const group = conversation as { removeMembers: (ids: string[]) => Promise<void> };
        await group.removeMembers([client.inboxId]);
        streamManager.removeConversation(selectedId);
      }
    } catch (error) {
      console.error('Failed to leave group:', error);
    } finally {
      setIsLeavingGroup(false);
    }
  }, [client, selectedId, conversationMetadata?.conversationType, isLeavingGroup]);

  // Handle member added to group - sync to get XMTP's membership change message
  const handleMemberAdded = useCallback(async (_address: string, _displayName: string | null) => {
    if (!selectedId) return;

    try {
      // Sync and refresh to get XMTP's built-in membership change message
      // XMTP automatically creates these when members are added
      await streamManager.syncAndRefreshMessages(selectedId);
      await streamManager.refreshConversationMetadata(selectedId);
    } catch (error) {
      console.error('Failed to handle member added:', error);
    }
  }, [selectedId]);

  // Handle member removed from group - remove member, sync to get XMTP's membership change message
  const handleMemberRemoved = useCallback(async (inboxId: string, _address: string, _displayName: string | null) => {
    if (!client || !selectedId) return;

    try {
      // Get the conversation
      const conversation = await client.conversations.getConversationById(selectedId);
      if (!conversation || !('removeMembers' in conversation)) {
        throw new Error('Cannot remove members from this conversation');
      }

      const group = conversation as unknown as {
        removeMembers: (inboxIds: string[]) => Promise<void>;
      };

      // Remove the member
      await group.removeMembers([inboxId]);

      // Sync and refresh to get XMTP's built-in membership change message
      // XMTP automatically creates these when members are removed
      await streamManager.syncAndRefreshMessages(selectedId);
      await streamManager.refreshConversationMetadata(selectedId);
    } catch (error) {
      console.error('Failed to remove member:', error);
      throw error;
    }
  }, [client, selectedId]);

  // Try to restore session on mount if we have a cached session but no client
  const attemptRestore = useCallback(async () => {
    if (hasXmtpClient) {
      setRestorationAttempted(true);
      return;
    }

    // Check session on each attempt (might have been cleared)
    if (!hasQRSession()) {
      setRestorationAttempted(true);
      router.push("/");
      return;
    }

    setIsRestoring(true);
    setRestorationFailed(false);
    setIsLockedByOtherTab(false);

    try {
      const success = await restoreSession();

      if (!success) {
        // Check if session was cleared (expired) vs transient error
        if (!hasQRSession()) {
          router.push("/");
        } else {
          setRestorationFailed(true);
        }
      }
    } catch (error) {
      console.error("[ChatPage] Session restoration error:", error);

      // Check if it's a tab lock error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage === "TAB_LOCKED") {
        setIsLockedByOtherTab(true);
      } else if (!hasQRSession()) {
        router.push("/");
      } else {
        setRestorationFailed(true);
      }
    } finally {
      setIsRestoring(false);
      setRestorationAttempted(true);
    }
  }, [hasXmtpClient, restoreSession, router]);

  // Initial restoration attempt
  useEffect(() => {
    if (restorationRef.current) return;
    restorationRef.current = true;
    attemptRestore();
  }, [attemptRestore]);

  // Show loading while restoring or initializing
  if (isRestoring || clientState.isInitializing || !restorationAttempted) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#005CFF]/10 flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-[#005CFF]" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-[#005CFF] animate-spin" />
            <span className="text-[#717680]">
              {isRestoring ? "Loading..." : "Loading..."}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Show UI when another tab has the XMTP lock
  if (isLockedByOtherTab) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-[#005CFF]/10 flex items-center justify-center">
            <Monitor className="w-8 h-8 text-[#005CFF]" />
          </div>
          <h2 className="text-lg font-semibold text-[#181818]">
            Chat Open in Another Tab
          </h2>
          <p className="text-[#717680]">
            World Chat is already open in another browser tab. Please close the
            other tab or use it instead.
          </p>
          <button
            onClick={() => {
              restorationRef.current = false;
              setIsLockedByOtherTab(false);
              attemptRestore();
            }}
            className="px-4 py-2 bg-[#005CFF] text-white rounded-lg hover:bg-[#0052E0] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show retry UI if restoration failed but session still exists
  if (restorationFailed || clientState.error) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-[#181818]">
            Connection Failed
          </h2>
          <p className="text-[#717680]">
            {clientState.error?.message ||
              "Failed to restore session. Please try again."}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                restorationRef.current = false;
                setRestorationFailed(false);
                attemptRestore();
              }}
              className="px-4 py-2 bg-[#005CFF] text-white rounded-lg hover:bg-[#0052E0] transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 bg-gray-100 text-[#181818] rounded-lg hover:bg-gray-200 transition-colors"
            >
              Login Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Not connected and no error - should redirect (handled by attemptRestore)
  if (!hasXmtpClient) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#005CFF] animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex w-full h-full">
        {/* Left Sidebar */}
        <Sidebar onNewChat={() => setIsNewChatOpen(true)} />

        {/* Message Panel */}
        {selectedId && conversationMetadata ? (
          conversationMetadata.conversationType === "group" ? (
            <MemoizedMessagePanel
              key={selectedId}
              conversationId={selectedId}
              conversationType="group"
              groupName={conversationMetadata.groupName}
              memberCount={conversationMetadata.memberCount}
              memberPreviews={conversationMetadata.memberPreviews}
              avatarUrl={conversationMetadata.groupImageUrl}
              isMessageRequest={isMessageRequest}
              isVerified={isGroupVerified}
              verifiedCount={verifiedCount}
              unverifiedCount={unverifiedCount}
              onOpenGroupDetails={() => setShowGroupDetails(true)}
              onMemberAvatarClick={handleMemberAvatarClick}
            />
          ) : (
            <MemoizedMessagePanel
              key={selectedId}
              conversationId={selectedId}
              conversationType="dm"
              peerAddress={conversationMetadata.peerAddress}
              isVerified={isPeerVerified}
              isMessageRequest={isMessageRequest}
            />
          )
        ) : (
          <EmptyState />
        )}

        {/* Group Details Panel - inline beside MessagePanel */}
        {showGroupDetails && selectedId && conversationMetadata?.conversationType === "group" && (
          <GroupDetailsPanel
            onClose={() => setShowGroupDetails(false)}
            groupName={conversationMetadata.groupName || "Group Chat"}
            memberPreviews={conversationMetadata.memberPreviews}
            verifiedCount={verifiedCount}
            unverifiedCount={unverifiedCount}
            avatarUrl={conversationMetadata.groupImageUrl}
            conversationId={selectedId}
            onLeaveGroup={handleLeaveGroup}
            isLeavingGroup={isLeavingGroup}
            ownInboxId={client?.inboxId}
            onMemberAdded={handleMemberAdded}
            onMemberRemoved={handleMemberRemoved}
          />
        )}

        {/* Member Profile Panel - shows when clicking on a member avatar in group */}
        {selectedMemberProfile && (
          <MemberProfilePanel
            address={selectedMemberProfile.address}
            inboxId={selectedMemberProfile.inboxId}
            onClose={() => setSelectedMemberProfile(null)}
          />
        )}
      </div>

      {/* New Conversation Modal */}
      <NewConversationModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
      />
    </>
  );
}
