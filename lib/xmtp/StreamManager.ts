/**
 * XMTPStreamManager - Singleton that manages all XMTP streaming outside React lifecycle
 *
 * This decouples data management from React rendering:
 * - Single source of truth for all streams
 * - No duplicate loading or streams
 * - Survives component mount/unmount
 * - Updates Jotai atoms which React subscribes to
 */

import type { Dm, Group } from '@xmtp/browser-sdk';
import { SortDirection } from '@xmtp/browser-sdk';
import type { AnyClient } from '@/types/xmtp';
import {
  store,
  conversationIdsAtom,
  isLoadingConversationsAtom,
  conversationsErrorAtom,
  conversationMetadataVersionAtom,
  allConversationMessageIdsAtom,
  allConversationPaginationAtom,
  messageCache,
} from '@/stores';
import type { DecodedMessage } from '@xmtp/browser-sdk';
import type { PaginationState } from '@/types/messages';

// Conversation type
type Conversation = Dm | Group;

// Member preview for group avatars
interface MemberPreview {
  inboxId: string;
  address: string;
}

interface ConversationMetadata {
  id: string;
  conversationType: 'dm' | 'group';
  // For DMs
  peerAddress: string;
  peerInboxId: string;
  // For Groups
  groupName?: string;
  groupImageUrl?: string;
  memberCount?: number;
  memberPreviews?: MemberPreview[];
  // Common
  lastMessagePreview: string;
  lastActivityNs: bigint;
}

// Check if a conversation is a DM
function isDm(conv: unknown): conv is Dm & { peerInboxId(): Promise<string> } {
  return typeof (conv as { peerInboxId?: unknown }).peerInboxId === 'function';
}

// Content type IDs for special message types
const CONTENT_TYPE_READ_RECEIPT = 'readReceipt';
const CONTENT_TYPE_REACTION = 'reaction';
const CONTENT_TYPE_REPLY = 'reply';

// Message loading limits
const INITIAL_MESSAGE_LIMIT = 20;  // Fast initial load
const LOAD_MORE_LIMIT = 50;        // Larger batch when scrolling
const PREVIEW_SEARCH_LIMIT = 10;   // Messages to search for displayable preview

// Check if a message is a special type that shouldn't be displayed as text
function isSpecialContentType(message: { contentType?: { typeId?: string } }): boolean {
  const typeId = message.contentType?.typeId;
  return typeId === CONTENT_TYPE_READ_RECEIPT || typeId === CONTENT_TYPE_REACTION;
}

// Extract text content from a message
function extractMessageContent(message: { content: unknown; contentType?: { typeId?: string } }): string {
  // Skip read receipts and reactions for preview
  if (isSpecialContentType(message)) {
    return '';
  }

  const content = message.content;
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') {
    // Handle text content
    if ('text' in content && typeof (content as { text?: unknown }).text === 'string') {
      return (content as { text: string }).text;
    }
    // Handle reply content (has nested content)
    if ('content' in content) {
      const nestedContent = (content as { content: unknown }).content;
      if (typeof nestedContent === 'string') return nestedContent;
      if (nestedContent && typeof nestedContent === 'object' && 'text' in nestedContent) {
        return (nestedContent as { text: string }).text;
      }
    }
  }
  return '';
}

class XMTPStreamManager {
  private client: AnyClient | null = null;
  private conversationStreamController: AbortController | null = null;
  private messageStreamControllers: Map<string, AbortController> = new Map();

  // Track what's been loaded to prevent duplicates
  private conversationsLoaded = false;
  private loadedMessageConversations = new Set<string>();

  // Store conversation metadata (not in atoms to avoid re-renders)
  private conversationMetadata = new Map<string, ConversationMetadata>();

  // Store conversation instances for reuse
  private conversations = new Map<string, Conversation>();

  /**
   * Initialize the manager with an XMTP client
   */
  async initialize(client: AnyClient): Promise<void> {
    // Clean up any existing state
    this.cleanup();

    this.client = client;

    // Load conversations and start streaming
    await this.loadConversations();
    this.startConversationStream();
  }

  /**
   * Load all conversations from XMTP
   */
  private async loadConversations(): Promise<void> {
    if (!this.client || this.conversationsLoaded) return;

    this.conversationsLoaded = true;
    store.set(isLoadingConversationsAtom, true);
    store.set(conversationsErrorAtom, null);

    try {
      await this.client.conversations.sync();
      const conversations = await this.client.conversations.list();

      const ids: string[] = [];

      for (const conv of conversations) {
        this.conversations.set(conv.id, conv);
        ids.push(conv.id);

        // Build metadata
        const metadata = await this.buildConversationMetadata(conv);
        this.conversationMetadata.set(conv.id, metadata);
      }

      // Sort by last activity (most recent first)
      ids.sort((a, b) => {
        const metaA = this.conversationMetadata.get(a);
        const metaB = this.conversationMetadata.get(b);
        if (!metaA || !metaB) return 0;
        return Number(metaB.lastActivityNs - metaA.lastActivityNs);
      });

      store.set(conversationIdsAtom, ids);
      // Notify that metadata has been updated
      this.incrementMetadataVersion();
      console.log(`[StreamManager] Loaded ${ids.length} conversations`);
    } catch (error) {
      console.error('[StreamManager] Failed to load conversations:', error);
      store.set(conversationsErrorAtom, error instanceof Error ? error : new Error('Failed to load'));
    } finally {
      store.set(isLoadingConversationsAtom, false);
    }
  }

  /**
   * Increment metadata version to trigger UI updates
   */
  private incrementMetadataVersion(): void {
    const current = store.get(conversationMetadataVersionAtom);
    store.set(conversationMetadataVersionAtom, current + 1);
  }

  /**
   * Build metadata for a conversation
   */
  private async buildConversationMetadata(conv: Conversation): Promise<ConversationMetadata> {
    let conversationType: 'dm' | 'group' = 'dm';
    let peerAddress = '';
    let peerInboxId = '';
    let groupName: string | undefined;
    let groupImageUrl: string | undefined;
    let memberCount: number | undefined;
    let memberPreviews: MemberPreview[] | undefined;
    let lastMessagePreview = '';
    let lastActivityNs = BigInt(0);

    try {
      if (isDm(conv)) {
        // DM: Get peer info
        conversationType = 'dm';
        peerInboxId = await conv.peerInboxId();
        const members = await conv.members();
        for (const member of members) {
          if (member.inboxId === peerInboxId && member.accountIdentifiers?.length) {
            peerAddress = member.accountIdentifiers[0].identifier;
            break;
          }
        }
      } else {
        // Group: Get group info
        conversationType = 'group';
        const group = conv as Group;
        groupName = group.name;
        groupImageUrl = group.imageUrl;
        const members = await group.members();
        memberCount = members.length;
        // Get first 4 members for avatar previews
        memberPreviews = members.slice(0, 4).map((m) => ({
          inboxId: m.inboxId,
          address: m.accountIdentifiers?.[0]?.identifier ?? '',
        }));
      }

      // Get last message preview (newest first)
      // Fetch a few messages to find the first displayable one (skip read receipts, reactions)
      const messages = await conv.messages({
        limit: BigInt(PREVIEW_SEARCH_LIMIT),
        direction: SortDirection.Descending,
      });

      // Find first message with displayable content
      for (const msg of messages) {
        const content = extractMessageContent(msg);
        if (content) {
          lastMessagePreview = content;
          lastActivityNs = msg.sentAtNs;
          break;
        }
        // Still track activity time even for non-displayable messages
        if (lastActivityNs === BigInt(0)) {
          lastActivityNs = msg.sentAtNs;
        }
      }
    } catch (error) {
      console.error('[StreamManager] Error building metadata for', conv.id, error);
    }

    return {
      id: conv.id,
      conversationType,
      peerAddress,
      peerInboxId,
      groupName,
      groupImageUrl,
      memberCount,
      memberPreviews,
      lastMessagePreview,
      lastActivityNs,
    };
  }

  /**
   * Start streaming new conversations
   */
  private startConversationStream(): void {
    if (!this.client) return;

    this.conversationStreamController = new AbortController();
    const signal = this.conversationStreamController.signal;

    const stream = async () => {
      try {
        const streamProxy = await this.client!.conversations.stream();

        for await (const conv of streamProxy as AsyncIterable<Conversation>) {
          if (signal.aborted) break;

          console.log('[StreamManager] New conversation:', conv.id);

          this.conversations.set(conv.id, conv);
          const metadata = await this.buildConversationMetadata(conv);
          this.conversationMetadata.set(conv.id, metadata);

          // Prepend to list
          const currentIds = store.get(conversationIdsAtom);
          if (!currentIds.includes(conv.id)) {
            store.set(conversationIdsAtom, [conv.id, ...currentIds]);
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error('[StreamManager] Conversation stream error:', error);
        }
      }
    };

    stream();
  }

  // Pending updates to batch together
  private pendingMessageUpdates = new Map<string, string[]>();
  private pendingPaginationUpdates = new Map<string, PaginationState>();
  private updateScheduled = false;

  /**
   * Flush all pending updates in a single batch
   */
  private flushUpdates(): void {
    if (!this.updateScheduled) return;
    this.updateScheduled = false;

    // Batch message ID updates
    if (this.pendingMessageUpdates.size > 0) {
      const current = store.get(allConversationMessageIdsAtom);
      const newMap = new Map(current);
      for (const [id, ids] of this.pendingMessageUpdates) {
        newMap.set(id, ids);
      }
      this.pendingMessageUpdates.clear();
      store.set(allConversationMessageIdsAtom, newMap);
    }

    // Batch pagination updates
    if (this.pendingPaginationUpdates.size > 0) {
      const current = store.get(allConversationPaginationAtom);
      const newMap = new Map(current);
      for (const [id, pagination] of this.pendingPaginationUpdates) {
        newMap.set(id, pagination);
      }
      this.pendingPaginationUpdates.clear();
      store.set(allConversationPaginationAtom, newMap);
    }
  }

  /**
   * Schedule updates to be flushed on next microtask
   */
  private scheduleFlush(): void {
    if (this.updateScheduled) return;
    this.updateScheduled = true;
    queueMicrotask(() => this.flushUpdates());
  }

  /**
   * Helper to update message IDs in the Map-based atom (batched)
   */
  private setMessageIds(conversationId: string, ids: string[]): void {
    this.pendingMessageUpdates.set(conversationId, ids);
    this.scheduleFlush();
  }

  /**
   * Helper to update pagination in the Map-based atom (batched)
   */
  private setPagination(conversationId: string, pagination: PaginationState): void {
    this.pendingPaginationUpdates.set(conversationId, pagination);
    this.scheduleFlush();
  }

  /**
   * Helper to get pagination for a conversation
   */
  private getPagination(conversationId: string): PaginationState {
    const map = store.get(allConversationPaginationAtom);
    return map.get(conversationId) ?? { hasMore: true, oldestMessageNs: null, isLoading: false };
  }

  /**
   * Helper to get message IDs for a conversation
   */
  private getMessageIds(conversationId: string): string[] {
    const map = store.get(allConversationMessageIdsAtom);
    return map.get(conversationId) ?? [];
  }

  /**
   * Load messages for a conversation (called when user opens a conversation)
   */
  async loadMessagesForConversation(conversationId: string): Promise<void> {
    if (!this.client || this.loadedMessageConversations.has(conversationId)) return;

    this.loadedMessageConversations.add(conversationId);

    // Update pagination to loading
    this.setPagination(conversationId, {
      hasMore: true,
      oldestMessageNs: null,
      isLoading: true,
    });

    try {
      const conv = this.conversations.get(conversationId)
        || await this.client.conversations.getConversationById(conversationId);

      if (!conv) {
        console.error('[StreamManager] Conversation not found:', conversationId);
        return;
      }

      // Sync and load messages (descending = newest first for initial load)
      // Only load 20 initially for performance - more loaded on scroll
      await conv.sync();
      const messages = await conv.messages({
        limit: BigInt(INITIAL_MESSAGE_LIMIT),
        direction: SortDirection.Descending,
      });

      // Store messages - keep in descending order (newest first) for display
      const ids: string[] = [];
      for (const msg of messages) {
        messageCache.set(msg.id, msg as unknown as DecodedMessage);
        ids.push(msg.id);
      }

      this.setMessageIds(conversationId, ids);
      this.setPagination(conversationId, {
        hasMore: messages.length === INITIAL_MESSAGE_LIMIT,
        // Track oldest message for pagination (last item in descending order)
        oldestMessageNs: messages.length > 0 ? messages[messages.length - 1].sentAtNs : null,
        isLoading: false,
      });

      console.log(`[StreamManager] Loaded ${messages.length} messages for ${conversationId}`);

      // Start message stream for this conversation
      this.startMessageStream(conversationId, conv);
    } catch (error) {
      console.error('[StreamManager] Failed to load messages:', error);
      this.setPagination(conversationId, {
        hasMore: false,
        oldestMessageNs: null,
        isLoading: false,
      });
    }
  }

  /**
   * Load more (older) messages for a conversation
   */
  async loadMoreMessages(conversationId: string): Promise<void> {
    const pagination = this.getPagination(conversationId);
    if (!this.client || pagination.isLoading || !pagination.hasMore) return;

    const conv = this.conversations.get(conversationId);
    if (!conv) return;

    this.setPagination(conversationId, {
      ...pagination,
      isLoading: true,
    });

    try {
      // Load older messages (before our oldest) in descending order
      const messages = await conv.messages({
        limit: BigInt(LOAD_MORE_LIMIT),
        sentBeforeNs: pagination.oldestMessageNs ?? undefined,
        direction: SortDirection.Descending,
      });

      // Append older messages to end of list (they're already in descending order)
      const currentIds = this.getMessageIds(conversationId);
      const newIds: string[] = [];

      for (const msg of messages) {
        if (!messageCache.has(msg.id)) {
          messageCache.set(msg.id, msg as unknown as DecodedMessage);
          newIds.push(msg.id);
        }
      }

      // Append to end (older messages go after current ones in our descending list)
      this.setMessageIds(conversationId, [...currentIds, ...newIds]);
      this.setPagination(conversationId, {
        hasMore: messages.length === LOAD_MORE_LIMIT,
        // Update oldest to the last message in this batch
        oldestMessageNs: messages.length > 0 ? messages[messages.length - 1].sentAtNs : pagination.oldestMessageNs,
        isLoading: false,
      });
    } catch (error) {
      console.error('[StreamManager] Failed to load more messages:', error);
      this.setPagination(conversationId, {
        ...pagination,
        isLoading: false,
      });
    }
  }

  /**
   * Start streaming messages for a specific conversation
   */
  private startMessageStream(conversationId: string, conv: Conversation): void {
    // Don't create duplicate streams
    if (this.messageStreamControllers.has(conversationId)) return;

    const controller = new AbortController();
    this.messageStreamControllers.set(conversationId, controller);
    const signal = controller.signal;

    const stream = async () => {
      try {
        const streamProxy = await conv.stream();

        for await (const msg of streamProxy as AsyncIterable<{ id: string; content: unknown; sentAtNs: bigint; senderInboxId: string }>) {
          if (signal.aborted) break;

          // Skip if we already have this message
          if (messageCache.has(msg.id)) continue;

          console.log('[StreamManager] New message in', conversationId);

          messageCache.set(msg.id, msg as unknown as DecodedMessage);

          // Prepend to list
          const currentIds = this.getMessageIds(conversationId);
          if (!currentIds.includes(msg.id)) {
            this.setMessageIds(conversationId, [msg.id, ...currentIds]);
          }

          // Update conversation metadata
          const metadata = this.conversationMetadata.get(conversationId);
          if (metadata) {
            // Only update preview if message has displayable content
            const content = extractMessageContent(msg);
            if (content) {
              metadata.lastMessagePreview = content;
            }
            // Always update activity time
            metadata.lastActivityNs = msg.sentAtNs;
            // Notify UI of metadata change
            this.incrementMetadataVersion();
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error('[StreamManager] Message stream error for', conversationId, error);
        }
      }
    };

    stream();
  }

  /**
   * Send a message to a conversation
   */
  async sendMessage(conversationId: string, content: string): Promise<string | null> {
    const conv = this.conversations.get(conversationId);
    if (!conv || !content.trim()) return null;

    try {
      const messageId = await conv.send(content.trim());

      // The stream will pick up the message, but we can also add it immediately
      // to avoid waiting for the round-trip
      const currentIds = this.getMessageIds(conversationId);
      if (!currentIds.includes(messageId)) {
        this.setMessageIds(conversationId, [messageId, ...currentIds]);
      }

      return messageId;
    } catch (error) {
      console.error('[StreamManager] Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Get metadata for a conversation
   */
  getConversationMetadata(conversationId: string): ConversationMetadata | undefined {
    return this.conversationMetadata.get(conversationId);
  }

  /**
   * Get all conversation metadata as a Map
   */
  getAllConversationMetadata(): Map<string, ConversationMetadata> {
    return new Map(this.conversationMetadata);
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.client !== null;
  }

  /**
   * Cleanup all streams and state
   */
  cleanup(): void {
    console.log('[StreamManager] Cleaning up...');

    // Abort all streams
    this.conversationStreamController?.abort();
    this.conversationStreamController = null;

    for (const controller of this.messageStreamControllers.values()) {
      controller.abort();
    }
    this.messageStreamControllers.clear();

    // Reset state
    this.client = null;
    this.conversationsLoaded = false;
    this.loadedMessageConversations.clear();
    this.conversationMetadata.clear();
    this.conversations.clear();
  }
}

// Export singleton instance
export const streamManager = new XMTPStreamManager();
