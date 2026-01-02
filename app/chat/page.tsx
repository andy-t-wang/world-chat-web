'use client';

import { useEffect, useState, memo } from 'react';
import { useRouter } from 'next/navigation';
import { useAtomValue } from 'jotai';
import { Sidebar, MessagePanel, EmptyState } from '@/components/chat';
import { NewConversationModal } from '@/components/chat/NewConversationModal';
import { selectedConversationIdAtom } from '@/stores/ui';
import { clientStateAtom } from '@/stores/client';
import { useConversationMetadata } from '@/hooks/useConversations';
import { hasQRSession } from '@/lib/auth/session';
import { Loader2, MessageCircle, AlertCircle } from 'lucide-react';

// Memoized MessagePanel wrapper to prevent unnecessary re-renders
const MemoizedMessagePanel = memo(MessagePanel);

export default function ChatPage() {
  const router = useRouter();
  const clientState = useAtomValue(clientStateAtom);
  const selectedId = useAtomValue(selectedConversationIdAtom);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [hasSession] = useState(() => hasQRSession());

  // Track if we've given state time to settle (prevents race condition redirect)
  const [isStateSettled, setIsStateSettled] = useState(false);

  const hasXmtpClient = clientState.client !== null;

  // Get conversation metadata from StreamManager (no loading needed)
  const conversationMetadata = useConversationMetadata(selectedId);

  // Give state time to settle before allowing redirect (prevents race condition)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStateSettled(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Redirect to home if no client available
  useEffect(() => {
    if (!isStateSettled) return;
    if (hasXmtpClient) return;
    if (clientState.isInitializing) return;

    // If we have a session flag but no client, the page was reloaded
    // XMTP client is in-memory only, so we need to re-login
    if (hasSession && !hasXmtpClient) {
      console.log('[ChatPage] Session exists but no client - page was reloaded, redirecting to login');
    } else {
      console.log('[ChatPage] No session found, redirecting to login');
    }
    router.push('/');
  }, [isStateSettled, hasXmtpClient, hasSession, clientState.isInitializing, router]);

  // Show loading only while state is settling (brief moment on navigation)
  // Don't show loading forever if session exists but client doesn't (reload case)
  if (!isStateSettled) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#005CFF] animate-spin" />
      </div>
    );
  }

  // Not connected - redirect handled by useEffect
  if (!hasXmtpClient && !clientState.isInitializing) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#005CFF] animate-spin" />
      </div>
    );
  }

  // Show error if XMTP initialization failed
  if (clientState.error) {
    return (
      <div className="flex w-full h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-[#181818]">Connection Failed</h2>
          <p className="text-[#717680]">{clientState.error.message}</p>
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
