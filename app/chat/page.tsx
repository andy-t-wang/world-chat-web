'use client';

import { useAtomValue } from 'jotai';
import { Sidebar, MessagePanel, EmptyState } from '@/components/chat';
import { selectedConversationIdAtom } from '@/stores/ui';

// Demo data - would come from store in production
const DEMO_CONVERSATIONS: Record<string, { name: string; avatarUrl?: string; isVerified: boolean }> = {
  '1': { name: 'Dave', isVerified: true },
  '2': { name: 'Ethan Carter', isVerified: true },
  '3': { name: 'Alex', isVerified: true },
  '4': { name: 'Munichers', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=munichers', isVerified: true },
  '5': { name: 'Tiago', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=tiago', isVerified: true },
  '6': { name: 'Mr. Strickland', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=strickland', isVerified: true },
  '7': { name: 'Peter', isVerified: true },
};

export default function ChatPage() {
  const selectedId = useAtomValue(selectedConversationIdAtom);
  const selectedConversation = selectedId ? DEMO_CONVERSATIONS[selectedId] : null;

  return (
    <div className="flex w-full h-full">
      {/* Left Sidebar */}
      <Sidebar onNewChat={() => console.log('New chat clicked')} />

      {/* Right Panel */}
      {selectedConversation ? (
        <MessagePanel
          conversationId={selectedId!}
          name={selectedConversation.name}
          avatarUrl={selectedConversation.avatarUrl}
          isVerified={selectedConversation.isVerified}
          subtitle="Online"
        />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
