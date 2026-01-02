'use client';

import { useEffect, useState, memo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAtomValue } from 'jotai';
import { Sidebar, MessagePanel, EmptyState } from '@/components/chat';
import { NewConversationModal } from '@/components/chat/NewConversationModal';
import { selectedConversationIdAtom } from '@/stores/ui';
import { clientStateAtom } from '@/stores/client';
import { useConversationMetadata } from '@/hooks/useConversations';
import { useQRXmtpClient } from '@/hooks/useQRXmtpClient';
import { hasQRSession } from '@/lib/auth/session';
import { Loader2, MessageCircle, AlertCircle } from 'lucide-react';

// Memoized MessagePanel wrapper to prevent unnecessary re-renders
const MemoizedMessagePanel = memo(MessagePanel);

export default function ChatPage() {
  const router = useRouter();
  const clientState = useAtomValue(clientStateAtom);
  const { restoreSession } = useQRXmtpClient();
  const selectedId = useAtomValue(selectedConversationIdAtom);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [hasSession] = useState(() => hasQRSession());
  const [isRestoring, setIsRestoring] = useState(false);
  const [restorationAttempted, setRestorationAttempted] = useState(false);
  const restorationRef = useRef(false);

  const hasXmtpClient = clientState.client !== null;

  // Get conversation metadata from StreamManager (no loading needed)
  const conversationMetadata = useConversationMetadata(selectedId);

  // Try to restore session on mount if we have a cached session but no client
  useEffect(() => {
    if (restorationRef.current) return;
    if (hasXmtpClient) {
      setRestorationAttempted(true);
      return;
    }
    if (!hasSession) {
      setRestorationAttempted(true);
      return;
    }

    restorationRef.current = true;
    setIsRestoring(true);

    restoreSession()
      .then((success) => {
        console.log('[ChatPage] Session restoration:', success ? 'success' : 'failed');
        if (!success) {
          // Restoration failed, redirect to login
          router.push('/');
        }
      })
      .catch((error) => {
        console.error('[ChatPage] Session restoration error:', error);
        router.push('/');
      })
      .finally(() => {
        setIsRestoring(false);
        setRestorationAttempted(true);
      });
  }, [hasXmtpClient, hasSession, restoreSession, router]);

  // Redirect to login if no session and restoration complete
  useEffect(() => {
    if (!restorationAttempted) return;
    if (hasXmtpClient) return;
    if (clientState.isInitializing || isRestoring) return;

    console.log('[ChatPage] No client after restoration, redirecting to login');
    router.push('/');
  }, [restorationAttempted, hasXmtpClient, clientState.isInitializing, isRestoring, router]);

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
              {isRestoring ? 'Restoring session...' : 'Loading...'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Not connected - redirect handled by useEffect
  if (!hasXmtpClient) {
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
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-[#005CFF] text-white rounded-lg hover:bg-[#0052E0] transition-colors"
          >
            Login Again
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
