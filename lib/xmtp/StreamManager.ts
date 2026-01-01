/**
 * XMTPStreamManager - Singleton that manages all XMTP streaming outside React lifecycle
 *
 * This decouples data management from React rendering:
 * - Single source of truth for all streams
 * - No duplicate loading or streams
 * - Survives component mount/unmount
 * - Updates Jotai atoms which React subscribes to
 */

import type { Client, Dm, Group } from '@xmtp/browser-sdk';
import {
  store,
  conversationIdsAtom,
  isLoadingConversationsAtom,
  conversationsErrorAtom,
  allConversationMessageIdsAtom,
  allConversationPaginationAtom,
  messageCache,
} from '@/stores';
import type { DecodedMessage } from '@xmtp/browser-sdk';
import type { PaginationState } from '@/types/messages';

// Conversation type
type Conversation = Dm | Group;

interface ConversationMetadata {
  id: string;
  peerAddress: string;
  peerInboxId: string;
  lastMessagePreview: string;
  lastActivityNs: bigint;
}

// Check if a conversation is a DM
function isDm(conv: unknown): conv is Dm & { peerInboxId(): Promise<string> } {
  return typeof (conv as { peerInboxId?: unknown }).peerInboxId === 'function';
}

// Extract text content from a message
function extractMessageContent(message: { content: unknown }): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') {
    if ('text' in content && typeof (content as { text?: unknown }).text === 'string') {
      return (content as { text: string }).text;
    }
    if ('type' in content) {
      return `[${(content as { type: string }).type}]`;
    }
  }
  return '';
}

class XMTPStreamManager {
  private client: Client | null = null;
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
  async initialize(client: Client): Promise<void> {
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
      console.log(`[StreamManager] Loaded ${ids.length} conversations`);
    } catch (error) {
      console.error('[StreamManager] Failed to load conversations:', error);
      store.set(conversationsErrorAtom, error instanceof Error ? error : new Error('Failed to load'));
    } finally {
      store.set(isLoadingConversationsAtom, false);
    }
  }

  /**
   * Build metadata for a conversation
   */
  private async buildConversationMetadata(conv: Conversation): Promise<ConversationMetadata> {
    let peerAddress = '';
    let peerInboxId = '';
    let lastMessagePreview = '';
    let lastActivityNs = BigInt(0);

    try {
      // Get peer info for DMs
      if (isDm(conv)) {
        peerInboxId = await conv.peerInboxId();
        const members = await conv.members();
        for (const member of members) {
          if (member.inboxId === peerInboxId && member.accountIdentifiers?.length) {
            peerAddress = member.accountIdentifiers[0].identifier;
            break;
          }
        }
      }

      // Get last message preview
      const messages = await conv.messages({ limit: BigInt(1) });
      if (messages.length > 0) {
        lastMessagePreview = extractMessageContent(messages[0]);
        lastActivityNs = messages[0].sentAtNs;
      }
    } catch (error) {
      console.error('[StreamManager] Error building metadata for', conv.id, error);
    }

    return {
      id: conv.id,
      peerAddress,
      peerInboxId,
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

      // Sync and load messages
      await conv.sync();
      const messages = await conv.messages({ limit: BigInt(50) });

      // Store messages
      const ids: string[] = [];
      for (const msg of messages) {
        messageCache.set(msg.id, msg as unknown as DecodedMessage);
        ids.push(msg.id);
      }

      this.setMessageIds(conversationId, ids);
      this.setPagination(conversationId, {
        hasMore: messages.length === 50,
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
      const messages = await conv.messages({
        limit: BigInt(50),
        sentBeforeNs: pagination.oldestMessageNs ?? undefined,
      });

      // Append to existing
      const currentIds = this.getMessageIds(conversationId);
      const newIds: string[] = [];

      for (const msg of messages) {
        if (!messageCache.has(msg.id)) {
          messageCache.set(msg.id, msg as unknown as DecodedMessage);
          newIds.push(msg.id);
        }
      }

      this.setMessageIds(conversationId, [...currentIds, ...newIds]);
      this.setPagination(conversationId, {
        hasMore: messages.length === 50,
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
            metadata.lastMessagePreview = extractMessageContent(msg);
            metadata.lastActivityNs = msg.sentAtNs;
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
