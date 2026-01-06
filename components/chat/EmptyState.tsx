'use client';

import { MessageSquare } from 'lucide-react';

interface EmptyStateProps {
  className?: string;
}

export function EmptyState({ className }: EmptyStateProps) {
  return (
    <div className={`flex-1 flex flex-col items-center justify-center bg-[#F5F5F5] text-center p-8 ${className || ''}`}>
      <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-4 shadow-sm">
        <MessageSquare className="w-10 h-10 text-[#9BA3AE]" />
      </div>
      <h2 className="text-xl font-semibold text-[#181818] mb-2">
        Select a conversation
      </h2>
      <p className="text-[#717680] max-w-sm">
        Choose a chat from the sidebar or start a new conversation to begin messaging.
      </p>
    </div>
  );
}
