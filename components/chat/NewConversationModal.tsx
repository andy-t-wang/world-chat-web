'use client';

import { useState, useCallback } from 'react';
import { X, Search, Loader2, UserPlus, AlertCircle, CheckCircle } from 'lucide-react';
import { useAtom } from 'jotai';
import { Avatar } from '@/components/ui/Avatar';
import { xmtpClientAtom } from '@/stores/client';
import { selectedConversationIdAtom } from '@/stores/ui';
import { searchUsernames } from '@/lib/username/service';
import { useCanMessage } from '@/hooks/useXmtpClient';
import type { UsernameRecord } from '@/types/username';
import type { Identifier } from '@xmtp/browser-sdk';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewConversationModal({ isOpen, onClose }: NewConversationModalProps) {
  const [client] = useAtom(xmtpClientAtom);
  const [, setSelectedConversationId] = useAtom(selectedConversationIdAtom);
  const { canMessage } = useCanMessage();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UsernameRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [canMessageStatus, setCanMessageStatus] = useState<Record<string, boolean | 'checking'>>({});

  // Check if input is a valid Ethereum address
  const isValidAddress = (input: string) => /^0x[a-fA-F0-9]{40}$/.test(input);

  // Search for usernames or validate address
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      if (isValidAddress(searchQuery)) {
        // Direct address input - create a synthetic result
        setSearchResults([
          {
            address: searchQuery as `0x${string}`,
            username: '',
            profile_picture_url: null,
            minimized_profile_picture_url: null,
          },
        ]);
        // Check if this address can receive messages
        setCanMessageStatus((prev) => ({ ...prev, [searchQuery.toLowerCase()]: 'checking' }));
        const canReceive = await canMessage(searchQuery);
        setCanMessageStatus((prev) => ({ ...prev, [searchQuery.toLowerCase()]: canReceive }));
      } else {
        // Search by username
        const results = await searchUsernames(searchQuery);
        setSearchResults(results);

        // Check canMessage for all results
        for (const result of results) {
          setCanMessageStatus((prev) => ({ ...prev, [result.address.toLowerCase()]: 'checking' }));
          const canReceive = await canMessage(result.address);
          setCanMessageStatus((prev) => ({ ...prev, [result.address.toLowerCase()]: canReceive }));
        }
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, canMessage]);

  // Create a new DM conversation
  const handleCreateConversation = useCallback(
    async (address: string) => {
      if (!client) {
        setError('XMTP client not initialized');
        return;
      }

      setIsCreating(true);
      setSelectedAddress(address);
      setError(null);

      try {
        const identifier: Identifier = {
          identifier: address.toLowerCase(),
          identifierKind: 'Ethereum',
        };

        // Create or find existing DM using identifier
        const conversation = await client.conversations.newDmWithIdentifier(identifier);

        console.log('Created conversation:', {
          id: conversation.id,
          peerInboxId: conversation.peerInboxId,
        });

        // Select the new conversation
        setSelectedConversationId(conversation.id);

        // Close the modal
        onClose();
      } catch (err) {
        console.error('Failed to create conversation:', err);
        setError(err instanceof Error ? err.message : 'Failed to create conversation');
      } finally {
        setIsCreating(false);
        setSelectedAddress(null);
      }
    },
    [client, setSelectedConversationId, onClose]
  );

  // Handle key press in search input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-[#181818]">New Conversation</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-[#717680]" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9BA3AE]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search username or enter address (0x...)"
              className="w-full pl-10 pr-4 py-3 bg-[#F5F5F5] rounded-xl text-[#181818] placeholder-[#9BA3AE] outline-none focus:ring-2 focus:ring-[#005CFF]/20"
              autoFocus
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#005CFF] animate-spin" />
            )}
          </div>

          <button
            onClick={handleSearch}
            disabled={!searchQuery.trim() || isSearching}
            className="mt-3 w-full py-2.5 bg-[#005CFF] text-white rounded-xl font-medium hover:bg-[#0052E0] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Search
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Search Results */}
        <div className="max-h-64 overflow-auto">
          {searchResults.length > 0 ? (
            <div className="pb-4">
              {searchResults.map((result) => {
                const addressLower = result.address.toLowerCase();
                const messageStatus = canMessageStatus[addressLower];
                const canReceive = messageStatus === true;
                const isChecking = messageStatus === 'checking';
                const isSelected = selectedAddress === result.address;

                return (
                  <button
                    key={result.address}
                    onClick={() => canReceive && handleCreateConversation(result.address)}
                    disabled={!canReceive || isCreating}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors"
                  >
                    <Avatar address={result.address} size="sm" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-medium text-[#181818] truncate">
                        {result.username || `${result.address.slice(0, 6)}...${result.address.slice(-4)}`}
                      </p>
                      {result.username && (
                        <p className="text-sm text-[#717680] truncate font-mono">
                          {result.address.slice(0, 6)}...{result.address.slice(-4)}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {isSelected && isCreating ? (
                        <Loader2 className="w-5 h-5 text-[#005CFF] animate-spin" />
                      ) : isChecking ? (
                        <Loader2 className="w-5 h-5 text-[#9BA3AE] animate-spin" />
                      ) : canReceive ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : messageStatus === false ? (
                        <span className="text-xs text-[#9BA3AE]">Can't message</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : searchQuery && !isSearching ? (
            <div className="p-8 text-center">
              <UserPlus className="w-10 h-10 text-[#9BA3AE] mx-auto mb-3" />
              <p className="text-[#717680]">No users found</p>
              <p className="text-sm text-[#9BA3AE] mt-1">Try a different username or enter an address</p>
            </div>
          ) : null}
        </div>

        {/* Footer hint */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-[#9BA3AE] text-center">
            Only users with XMTP enabled can receive messages
          </p>
        </div>
      </div>
    </div>
  );
}
