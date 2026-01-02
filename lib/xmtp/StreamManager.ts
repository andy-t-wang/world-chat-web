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
import { SortDirection, ConsentState } from '@xmtp/browser-sdk';
import { ContentTypeReadReceipt } from '@xmtp/content-type-read-receipt';
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
  readReceiptsAtom,
  readReceiptVersionAtom,
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

// Stream restart configuration
const STREAM_RESTART_DELAY_MS = 2000;  // Wait before restarting crashed stream
const MAX_STREAM_RESTARTS = 5;          // Max restart attempts before giving up

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

  // Stream restart attempt counters
  private conversationStreamRestarts = 0;
  private messageStreamRestarts = new Map<string, number>();

  /**
   * Initialize the manager with an XMTP client
   *
   * Strategy:
   * 1. Load local data immediately (fast)
   * 2. Start streams for real-time updates
   * 3. Do ONE background sync to catch up
   * 4. Never sync again - rely on streams
   */
  async initialize(client: AnyClient): Promise<void> {
    // Clean up any existing state
    this.cleanup();

    this.client = client;

    // Phase 1: Load from local cache (instant)
    await this.loadConversationsFromCache();

    // Phase 2: Start streams for real-time updates
    this.startConversationStream();

    // Phase 3: One-time background sync to catch up
    this.performInitialSync();
  }

  // Track if initial sync has been done
  private initialSyncDone = false;

  /**
   * Load conversations from local cache (no network)
   */
  private async loadConversationsFromCache(): Promise<void> {
    if (!this.client || this.conversationsLoaded) return;

    this.conversationsLoaded = true;
    store.set(isLoadingConversationsAtom, true);
    store.set(conversationsErrorAtom, null);

    try {
      // Load from local cache only (no network, instant)
      const localConversations = await this.client.conversations.list({
        consentStates: [ConsentState.Allowed],
      });

      const ids: string[] = [];

      for (const conv of localConversations) {
        this.conversations.set(conv.id, conv);
        ids.push(conv.id);

        // Build metadata from local cache only
        const metadata = await this.buildConversationMetadata(conv, false);
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
      this.incrementMetadataVersion();
      store.set(isLoadingConversationsAtom, false);

      console.log(`[StreamManager] Loaded ${ids.length} conversations from local cache`);

    } catch (error) {
      console.error('[StreamManager] Failed to load conversations:', error);
      store.set(conversationsErrorAtom, error instanceof Error ? error : new Error('Failed to load'));
      store.set(isLoadingConversationsAtom, false);
    }
  }

  /**
   * One-time initial sync - runs once after app load
   * After this, we rely entirely on streams for updates
   */
  private async performInitialSync(): Promise<void> {
    if (!this.client || this.initialSyncDone) return;

    this.initialSyncDone = true;

    try {
      console.log('[StreamManager] Performing one-time initial sync...');
      const startTime = Date.now();

      // Sync all allowed conversations from network
      await this.client.conversations.syncAll([ConsentState.Allowed]);

      // Re-list to get any new conversations
      const conversations = await this.client.conversations.list({
        consentStates: [ConsentState.Allowed],
      });

      let newCount = 0;
      const currentIds = store.get(conversationIdsAtom);
      const newIds = [...currentIds];

      for (const conv of conversations) {
        const isNew = !this.conversations.has(conv.id);
        this.conversations.set(conv.id, conv);

        if (isNew) {
          newIds.unshift(conv.id);
          newCount++;
        }

        // Rebuild metadata with synced data
        const metadata = await this.buildConversationMetadata(conv, false);
        this.conversationMetadata.set(conv.id, metadata);
      }

      // Sort and update
      newIds.sort((a, b) => {
        const metaA = this.conversationMetadata.get(a);
        const metaB = this.conversationMetadata.get(b);
        if (!metaA || !metaB) return 0;
        return Number(metaB.lastActivityNs - metaA.lastActivityNs);
      });

      store.set(conversationIdsAtom, newIds);
      this.incrementMetadataVersion();

      const duration = Date.now() - startTime;
      console.log(`[StreamManager] Initial sync complete in ${duration}ms, ${newCount} new conversations`);
      console.log('[StreamManager] Now relying on streams for updates');

    } catch (error) {
      console.error('[StreamManager] Initial sync error:', error);
      // Don't fail - local data is showing, streams will catch new updates
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
   * @param conv - The conversation
   * @param shouldSync - Whether to sync before fetching messages (false for fast local load)
   */
  private async buildConversationMetadata(conv: Conversation, shouldSync: boolean = true): Promise<ConversationMetadata> {
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
        // Get first 2 members for overlapping avatar previews
        memberPreviews = members.slice(0, 2).map((m) => ({
          inboxId: m.inboxId,
          address: m.accountIdentifiers?.[0]?.identifier ?? '',
        }));
      }

      // Only sync if requested (skip for fast local load)
      if (shouldSync) {
        await conv.sync();
      }

      // Get last message preview (newest first)
      // Fetch a few messages to find the first displayable one (skip read receipts, reactions)
      const messages = await conv.messages({
        limit: BigInt(PREVIEW_SEARCH_LIMIT),
        direction: SortDirection.Descending,
      });

      // Find first message with displayable content
      if (messages.length > 0) {
        console.log(`[StreamManager] Found ${messages.length} messages for preview in ${conv.id}, first:`, {
          id: messages[0].id,
          contentType: messages[0].contentType?.typeId,
          content: typeof messages[0].content === 'string' ? messages[0].content.slice(0, 50) : typeof messages[0].content,
        });
      } else {
        console.log(`[StreamManager] No messages found for preview in ${conv.id}`);
      }

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
   * Start streaming new conversations (only allowed ones)
   * Automatically restarts on crash with exponential backoff
   */
  private startConversationStream(): void {
    if (!this.client) return;

    // Abort existing stream if any
    this.conversationStreamController?.abort();
    this.conversationStreamController = new AbortController();
    const signal = this.conversationStreamController.signal;

    const stream = async () => {
      try {
        console.log('[StreamManager] Starting conversation stream...');
        const streamProxy = await this.client!.conversations.stream();

        // Reset restart counter on successful connection
        this.conversationStreamRestarts = 0;

        for await (const conv of streamProxy as AsyncIterable<Conversation>) {
          if (signal.aborted) break;

          // Only process allowed conversations
          const consentState = await conv.consentState();
          if (consentState !== ConsentState.Allowed) {
            console.log('[StreamManager] Skipping non-allowed conversation:', conv.id, consentState);
            continue;
          }

          console.log('[StreamManager] New allowed conversation:', conv.id);

          this.conversations.set(conv.id, conv);
          // New streamed conversations - sync to get initial messages
          const metadata = await this.buildConversationMetadata(conv, true);
          this.conversationMetadata.set(conv.id, metadata);

          // Prepend to list
          const currentIds = store.get(conversationIdsAtom);
          if (!currentIds.includes(conv.id)) {
            store.set(conversationIdsAtom, [conv.id, ...currentIds]);
          }
        }
      } catch (error) {
        if (signal.aborted) return; // Intentional abort, don't restart

        console.error('[StreamManager] Conversation stream crashed:', error);

        // Attempt restart if under limit
        if (this.conversationStreamRestarts < MAX_STREAM_RESTARTS) {
          this.conversationStreamRestarts++;
          const delay = STREAM_RESTART_DELAY_MS * this.conversationStreamRestarts;
          console.log(`[StreamManager] Restarting conversation stream in ${delay}ms (attempt ${this.conversationStreamRestarts}/${MAX_STREAM_RESTARTS})`);

          setTimeout(() => {
            if (!signal.aborted && this.client) {
              this.startConversationStream();
            }
          }, delay);
        } else {
          console.error('[StreamManager] Max conversation stream restarts reached, giving up');
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
   *
   * Strategy: Show local messages instantly, sync in background
   */
  async loadMessagesForConversation(conversationId: string): Promise<void> {
    if (!this.client || this.loadedMessageConversations.has(conversationId)) return;

    this.loadedMessageConversations.add(conversationId);

    try {
      const conv = this.conversations.get(conversationId)
        || await this.client.conversations.getConversationById(conversationId);

      if (!conv) {
        console.error('[StreamManager] Conversation not found:', conversationId);
        return;
      }

      // PHASE 1: Load from local cache FIRST (no network, instant)
      const localMessages = await conv.messages({
        limit: BigInt(INITIAL_MESSAGE_LIMIT),
        direction: SortDirection.Descending,
      });

      // Store and display local messages immediately
      // Also process read receipts from the peer
      const ids: string[] = [];
      for (const msg of localMessages) {
        const typeId = (msg as { contentType?: { typeId?: string } }).contentType?.typeId;

        // Process read receipts from the peer
        if (typeId === CONTENT_TYPE_READ_RECEIPT) {
          if (msg.senderInboxId !== this.client?.inboxId) {
            this.updateReadReceipt(conversationId, msg.sentAtNs);
          }
          continue; // Don't add to message list
        }

        messageCache.set(msg.id, msg as unknown as DecodedMessage);
        ids.push(msg.id);
      }

      this.setMessageIds(conversationId, ids);
      this.setPagination(conversationId, {
        hasMore: localMessages.length === INITIAL_MESSAGE_LIMIT,
        oldestMessageNs: localMessages.length > 0 ? localMessages[localMessages.length - 1].sentAtNs : null,
        isLoading: false,
      });

      console.log(`[StreamManager] Loaded ${localMessages.length} local messages for ${conversationId}`);

      // Start message stream (catches new messages in real-time)
      // We rely on streams now - no background sync needed
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
   * Automatically restarts on crash with exponential backoff
   */
  private startMessageStream(conversationId: string, conv: Conversation): void {
    // Abort existing stream if any (handles restart case)
    const existingController = this.messageStreamControllers.get(conversationId);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    this.messageStreamControllers.set(conversationId, controller);
    const signal = controller.signal;

    const stream = async () => {
      try {
        console.log(`[StreamManager] Starting message stream for ${conversationId}...`);
        const streamProxy = await conv.stream();

        // Reset restart counter on successful connection
        this.messageStreamRestarts.set(conversationId, 0);

        for await (const msg of streamProxy as AsyncIterable<{ id: string; content: unknown; sentAtNs: bigint; senderInboxId: string; contentType?: { typeId?: string } }>) {
          if (signal.aborted) break;

          // Check if this is a read receipt from the peer
          const typeId = msg.contentType?.typeId;
          if (typeId === CONTENT_TYPE_READ_RECEIPT) {
            // This is a read receipt - update the timestamp
            // The sentAtNs of the read receipt indicates when they read our messages
            // Only process if it's from the peer (not our own read receipt)
            if (msg.senderInboxId !== this.client?.inboxId) {
              this.updateReadReceipt(conversationId, msg.sentAtNs);
            }
            continue; // Don't add read receipts to message list
          }

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
        if (signal.aborted) return; // Intentional abort, don't restart

        console.error('[StreamManager] Message stream crashed for', conversationId, error);

        // Attempt restart if under limit
        const restarts = this.messageStreamRestarts.get(conversationId) ?? 0;
        if (restarts < MAX_STREAM_RESTARTS) {
          this.messageStreamRestarts.set(conversationId, restarts + 1);
          const delay = STREAM_RESTART_DELAY_MS * (restarts + 1);
          console.log(`[StreamManager] Restarting message stream for ${conversationId} in ${delay}ms (attempt ${restarts + 1}/${MAX_STREAM_RESTARTS})`);

          setTimeout(() => {
            if (!signal.aborted && this.client) {
              this.startMessageStream(conversationId, conv);
            }
          }, delay);
        } else {
          console.error(`[StreamManager] Max message stream restarts reached for ${conversationId}, giving up`);
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
   * Send a read receipt for a conversation
   * Call this when the user views/opens a conversation
   */
  async sendReadReceipt(conversationId: string): Promise<void> {
    const conv = this.conversations.get(conversationId);
    if (!conv) return;

    try {
      // Send empty object with read receipt content type
      await conv.send({}, ContentTypeReadReceipt);
      console.log('[StreamManager] Sent read receipt for', conversationId);
    } catch (error) {
      // Don't throw - read receipts are not critical
      console.error('[StreamManager] Failed to send read receipt:', error);
    }
  }

  /**
   * Update the read receipt timestamp for a conversation
   * Called when we receive a read receipt from the peer
   */
  private updateReadReceipt(conversationId: string, timestampNs: bigint): void {
    const current = store.get(readReceiptsAtom);
    const existingTs = current.get(conversationId);

    // Only update if this is a newer timestamp
    if (!existingTs || timestampNs > existingTs) {
      const newMap = new Map(current);
      newMap.set(conversationId, timestampNs);
      store.set(readReceiptsAtom, newMap);

      // Increment version to trigger UI re-renders
      const version = store.get(readReceiptVersionAtom);
      store.set(readReceiptVersionAtom, version + 1);

      console.log('[StreamManager] Updated read receipt for', conversationId, 'at', timestampNs);
    }
  }

  /**
   * Check if a message was read by the peer
   * A message is considered "read" if it was sent before the peer's last read receipt
   */
  isMessageRead(conversationId: string, messageSentAtNs: bigint): boolean {
    const receipts = store.get(readReceiptsAtom);
    const lastReadTs = receipts.get(conversationId);
    if (!lastReadTs) return false;
    return messageSentAtNs <= lastReadTs;
  }

  /**
   * Get the read receipt timestamp for a conversation
   */
  getReadReceiptTimestamp(conversationId: string): bigint | undefined {
    const receipts = store.get(readReceiptsAtom);
    return receipts.get(conversationId);
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
    this.initialSyncDone = false;
    this.loadedMessageConversations.clear();
    this.conversationMetadata.clear();
    this.conversations.clear();

    // Reset restart counters
    this.conversationStreamRestarts = 0;
    this.messageStreamRestarts.clear();
  }
}

// Export singleton instance
export const streamManager = new XMTPStreamManager();
