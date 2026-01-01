'use client';

import { useEffect, useState, memo } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useAtomValue } from 'jotai';
import { Sidebar, MessagePanel, EmptyState } from '@/components/chat';
import { NewConversationModal } from '@/components/chat/NewConversationModal';
import { selectedConversationIdAtom } from '@/stores/ui';
import { useXmtpClient } from '@/hooks/useXmtpClient';
import { useConversationMetadata } from '@/hooks/useConversations';
import { wasConnected } from '@/lib/auth/session';
import { Loader2, MessageCircle, AlertCircle } from 'lucide-react';

// Memoized MessagePanel wrapper to prevent unnecessary re-renders
const MemoizedMessagePanel = memo(MessagePanel);

export default function ChatPage() {
  const router = useRouter();
  const { isConnected, isConnecting, isReconnecting } = useAccount();
  const { client, isInitializing, isReady, isRestoringSession, error: xmtpError } = useXmtpClient();
  const selectedId = useAtomValue(selectedConversationIdAtom);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [hadPreviousSession] = useState(() => wasConnected());

  // Get conversation metadata from StreamManager (no loading needed)
  const conversationMetadata = useConversationMetadata(selectedId);

  // Redirect to home only if definitively not connected (not just reconnecting)
  useEffect(() => {
    // Don't redirect if we had a previous session and might be reconnecting
    if (hadPreviousSession && (isConnecting || isReconnecting)) {
      return;
    }
    // Only redirect if we're sure there's no connection
    if (!isConnecting && !isReconnecting && !isConnected && !hadPreviousSession) {
      router.push('/');
    }
  }, [isConnected, isConnecting, isReconnecting, hadPreviousSession, router]);

  // Show loading while reconnecting
  if ((isConnecting || isReconnecting || !isConnected) && hadPreviousSession) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#005CFF] animate-spin" />
      </div>
    );
  }

  // Not connected and no previous session - redirect handled by useEffect
  if (!isConnected) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#005CFF] animate-spin" />
      </div>
    );
  }

  // Show XMTP initialization state (skip full loading screen for returning users)
  if (isInitializing && !isRestoringSession) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#005CFF]/10 flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-[#005CFF]" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-[#005CFF] animate-spin" />
            <span className="text-[#717680]">Setting up secure messaging...</span>
          </div>
        </div>
      </div>
    );
  }

  // Show error if XMTP initialization failed
  if (xmtpError) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-[#181818]">Connection Failed</h2>
          <p className="text-[#717680]">{xmtpError.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#005CFF] text-white rounded-lg hover:bg-[#0052E0] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex w-full h-full">
        {/* Left Sidebar */}
        <Sidebar onNewChat={() => setIsNewChatOpen(true)} />

        {/* Right Panel */}
        {selectedId && conversationMetadata ? (
          conversationMetadata.conversationType === 'group' ? (
            <MemoizedMessagePanel
              key={selectedId}
              conversationId={selectedId}
              conversationType="group"
              groupName={conversationMetadata.groupName}
              memberCount={conversationMetadata.memberCount}
              memberPreviews={conversationMetadata.memberPreviews}
              avatarUrl={conversationMetadata.groupImageUrl}
            />
          ) : (
            <MemoizedMessagePanel
              key={selectedId}
              conversationId={selectedId}
              conversationType="dm"
              peerAddress={conversationMetadata.peerAddress}
              isVerified={true}
            />
          )
        ) : (
          <EmptyState />
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
