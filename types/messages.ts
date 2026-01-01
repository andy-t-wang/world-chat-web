/**
 * Message-related Types
 * Types for messages, pending messages, and message operations
 */

import type { DecodedMessage } from '@xmtp/browser-sdk';

/** Pending message for optimistic updates */
export interface PendingMessage {
  id: string;
  conversationId: string;
  content: string;
  status: 'sending' | 'failed';
  sentAtNs: bigint;
  retryCount: number;
}

/** Message pagination state */
export interface PaginationState {
  hasMore: boolean;
  oldestInsertedAtNs: bigint | null;
  isLoading: boolean;
}

/** Cached message for LRU storage */
export interface CachedMessage {
  id: string;
  conversationId: string;
  senderInboxId: string;
  senderAddress: string;
  content: unknown;
  contentType: string;
  sentAtNs: bigint;
  insertedAtNs: bigint;
}

/** Message list item - can be either a real or pending message */
export type MessageListItem =
  | { type: 'message'; data: DecodedMessage }
  | { type: 'pending'; data: PendingMessage };

/** Options for loading messages */
export interface LoadMessagesOptions {
  limit?: number;
  beforeNs?: bigint;
  afterNs?: bigint;
  direction?: 'ascending' | 'descending';
}

/** Result of a message send operation */
export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: Error;
}

/** Message grouping for UI (by date/sender) */
export interface MessageGroup {
  id: string;
  senderId: string;
  messageIds: string[];
  startTime: bigint;
}

/** Message search filters */
export interface MessageSearchFilters {
  query?: string;
  conversationId?: string;
  startDate?: Date;
  endDate?: Date;
  senderAddress?: string;
}

/** Typing indicator state */
export interface TypingIndicator {
  conversationId: string;
  senderAddress: string;
  timestamp: number;
}
