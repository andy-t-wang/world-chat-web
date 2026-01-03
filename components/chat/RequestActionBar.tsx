'use client';

import { useState } from 'react';
import { useSetAtom } from 'jotai';
import { Loader2 } from 'lucide-react';
import { streamManager } from '@/lib/xmtp/StreamManager';
import { showMessageRequestsAtom, selectedConversationIdAtom } from '@/stores/ui';

interface RequestActionBarProps {
  conversationId: string;
}

export function RequestActionBar({ conversationId }: RequestActionBarProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const setShowRequests = useSetAtom(showMessageRequestsAtom);
  const setSelectedId = useSetAtom(selectedConversationIdAtom);

  const handleAccept = async () => {
    if (isAccepting || isBlocking) return;
    setIsAccepting(true);

    try {
      const success = await streamManager.acceptConversation(conversationId);
      if (success) {
        // Stay on the conversation - it's now accepted
        // The UI will automatically switch to showing the regular input
      }
    } catch (error) {
      console.error('Failed to accept conversation:', error);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleBlock = async () => {
    if (isAccepting || isBlocking) return;
    setIsBlocking(true);

    try {
      const success = await streamManager.rejectConversation(conversationId);
      if (success) {
        // Clear selection and go back to requests view
        setSelectedId(null);
        // Stay in requests view if we were viewing requests
      }
    } catch (error) {
      console.error('Failed to block conversation:', error);
    } finally {
      setIsBlocking(false);
    }
  };

  const isLoading = isAccepting || isBlocking;

  return (
    <div className="shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
      <div className="flex gap-3">
        {/* Block Button */}
        <button
          onClick={handleBlock}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#F5F5F5] text-[#717680] font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBlocking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : null}
          Block
        </button>

        {/* Accept Button */}
        <button
          onClick={handleAccept}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#005CFF] text-white font-medium rounded-xl hover:bg-[#0052E0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAccepting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : null}
          Accept
        </button>
      </div>
    </div>
  );
}
