# XMTP E2EE Chat Application

> Desktop-first web messaging app built on XMTP protocol with Telegram-style split-pane layout.

## Quick Start

```bash
pnpm install
pnpm dev        # http://localhost:3000 → redirects to /chat
pnpm exec tsc --noEmit  # Type check
```

Whenever you need to reference the XMTP docs use this: https://github.com/xmtp/docs-xmtp-org/blob/main/llms/llms-chat-apps.txt

---

## XMTP Browser SDK API Reference (@xmtp/browser-sdk v5.3.0)

### Key Differences from WorkerConversations

The `Client` class (from `Client.create()`) uses `Conversations` which has **async** methods, NOT `WorkerConversations` which has sync methods.

### Client Initialization

```typescript
import { Client } from '@xmtp/browser-sdk';

const client = await Client.create(signer, {
  env: 'production', // or 'dev'
  appVersion: 'MyApp/1.0.0',
});
```

### Conversations API

```typescript
// Sync conversations from network (required before list)
await client.conversations.sync();

// List all conversations - returns Promise<(Dm | Group)[]>
const conversations = await client.conversations.list();

// Get single conversation by ID - returns Promise<Dm | Group | undefined>
const conversation = await client.conversations.getConversationById(id);

// Create new DM
const dm = await client.conversations.newDmWithIdentifier({
  identifier: address.toLowerCase(),
  identifierKind: 'Ethereum',
});

// Stream new conversations - returns Promise<AsyncStreamProxy>
const stream = await client.conversations.stream();
for await (const conversation of stream) {
  console.log('New conversation:', conversation.id);
}
// Call stream.end() to stop
```

### Dm vs Group

```typescript
// Check if conversation is a DM
function isDm(conv: unknown): conv is { peerInboxId(): Promise<string> } {
  return typeof (conv as any).peerInboxId === 'function';
}

// DM-specific: get peer inbox ID (async!)
if (isDm(conversation)) {
  const peerInboxId = await conversation.peerInboxId();
}

// Both Dm and Group have:
const members = await conversation.members();
// members[].inboxId, members[].accountIdentifiers[].identifier
```

### Messages API

```typescript
// Sync conversation
await conversation.sync();

// Load messages - returns Promise<DecodedMessage[]>
const messages = await conversation.messages({
  limit: BigInt(30),
  direction: SortDirection.Descending,
});

// Send message - returns Promise<string> (message ID)
const messageId = await conversation.send('Hello!');

// Stream new messages - returns Promise<AsyncStreamProxy>
const stream = await conversation.stream();
for await (const message of stream) {
  console.log('New message:', message.id, message.content);
}
// Call stream.end() to stop
```

### Stream Pattern

All streams return `Promise<AsyncStreamProxy<T>>` which is an async iterable with `end()` method:

```typescript
let streamProxy: AsyncStreamProxy | null = null;

// Start stream
streamProxy = await conversation.stream();
for await (const item of streamProxy) {
  // Handle item
}

// Cleanup (in useEffect return)
streamProxy?.end();
```

### Important Notes

1. **Use Webpack, not Turbopack**: `pnpm dev` uses `--webpack` flag due to WASM loading issues with Turbopack
2. **All list/stream methods are async**: Always `await` them
3. **`peerInboxId()` is async**: Returns `Promise<string>`, only on `Dm` class
4. **Stream cleanup**: Call `stream.end()` not `stream.close()`
5. **COOP/COEP headers required**: For SharedArrayBuffer support

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 16.1** | App framework (App Router, Turbopack) |
| **React 19.2** | UI library |
| **TypeScript 5** | Type safety (target: ES2020) |
| **Tailwind CSS 4** | Styling |
| **Jotai** | Atomic state management |
| **@tanstack/react-virtual** | List virtualization |
| **@xmtp/browser-sdk** | E2EE messaging protocol |
| **wagmi + viem** | Wallet connection |
| **lucide-react** | Icons |

---

## Architecture

### Layout Structure (Telegram-style)

```
┌─────────────────────────────────────────────────────────────┐
│                        /chat                                 │
├──────────────────┬──────────────────────────────────────────┤
│    Sidebar       │           MessagePanel                   │
│   (320-380px)    │         (flex-1)                         │
│                  │                                          │
│  ┌────────────┐  │  ┌────────────────────────────────────┐ │
│  │ Search     │  │  │ Header (name, avatar, status)      │ │
│  ├────────────┤  │  ├────────────────────────────────────┤ │
│  │ Chat       │  │  │                                    │ │
│  │ Requests   │  │  │ Messages Area (virtualized)        │ │
│  ├────────────┤  │  │ - Incoming: white bg, left aligned │ │
│  │            │  │  │ - Outgoing: blue bg, right aligned │ │
│  │ Convo List │  │  │                                    │ │
│  │ (virtual)  │  │  ├────────────────────────────────────┤ │
│  │            │  │  │ Input (attach, text, emoji, send)  │ │
│  └────────────┘  │  └────────────────────────────────────┘ │
│                  │                                          │
│  Selected =      │  No selection = EmptyState              │
│  blue bg #005CFF │                                          │
└──────────────────┴──────────────────────────────────────────┘
```

### State Management (Jotai)

Key atoms in `stores/`:

| Atom | Purpose |
|------|---------|
| `selectedConversationIdAtom` | Currently selected conversation (drives MessagePanel) |
| `conversationIdsAtom` | List of conversation IDs |
| `conversationMetadataAtom(id)` | Metadata per conversation (preview, unread, etc.) |
| `messageAtomFamily(id)` | Individual message data (granular updates) |
| `conversationMessageIdsAtom(id)` | Message IDs per conversation |
| `xmtpClientAtom` | XMTP client instance |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION LAYERS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  RENDERING LAYER                                                      │  │
│   │  ├─ Virtualized lists (only visible items in DOM)                    │  │
│   │  ├─ ~20-30 DOM nodes regardless of message count                     │  │
│   │  └─ Optimistic UI updates                                            │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  STATE LAYER (Jotai)                                                  │  │
│   │  ├─ atomFamily for individual messages (granular subscriptions)      │  │
│   │  ├─ Conversation atoms (metadata only)                               │  │
│   │  ├─ Message ID lists per conversation (not full objects)             │  │
│   │  └─ LRU cache eviction for memory management                         │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  ENCRYPTION LAYER (Optional)                                          │  │
│   │  ├─ Web Crypto API (AES-GCM-256)                                     │  │
│   │  ├─ PBKDF2 key derivation from password                              │  │
│   │  └─ Non-extractable CryptoKey objects                                │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  PERSISTENCE LAYER                                                    │  │
│   │  ├─ XMTP libxmtp handles primary storage (SQLite in OPFS)            │  │
│   │  ├─ Optional Dexie.js cache for UI-specific data                     │  │
│   │  └─ Reactions/replies index for fast lookups                         │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  XMTP PROTOCOL LAYER                                                  │  │
│   │  ├─ MLS-based E2EE (handled by libxmtp)                              │  │
│   │  ├─ History sync across devices                                       │  │
│   │  ├─ Message streaming                                                 │  │
│   │  └─ Consent management                                                │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## XMTP Identifier Architecture

### Source of Truth: inboxId (NOT address)

**inboxId is the primary identifier** in XMTP. While wallet addresses are used for initial auth, they are NOT the source of truth:

| Identifier | Purpose | Scope |
|------------|---------|-------|
| `inboxId` | Unique user identity | Per user (across all devices/wallets) |
| `installationId` | Device/app instance | Per device installation |
| `address` | Wallet address | Auth only, NOT conversation key |

**Critical**: Multiple wallet addresses can map to a single inboxId. Always use inboxId for conversation and messaging operations.

### DM Stitching

When a user creates DMs from different installations, XMTP creates separate underlying MLS groups but **presents them as one unified conversation**:

```
User A (Installation 1) → DM to User B → MLS Group 1 (topic-1)
User A (Installation 2) → DM to User B → MLS Group 2 (topic-2)

UI displays: Single DM conversation (stitched from both topics)
```

**Push notification caveat**: Each DM can have multiple topics. You must subscribe to ALL topics via `allPushTopics()` or you'll miss notifications.

### History Sync

XMTP automatically syncs across devices using:

1. **Sync Group**: Special MLS group containing all user's devices
2. **Sync Worker**: Processes consent, archives, preferences
3. **History Server**: Stores encrypted payloads with keys distributed via sync group

What syncs: conversations, messages, consent state, HMAC keys.

**Post-import state**: Imported conversations start **inactive** and **read-only**. Check `conversation.isActive()` before network operations. Conversations reactivate when existing members send a message.

### State Mapping to Jotai

```typescript
// stores/client.ts - Use inboxId as primary identifier
export const currentInboxIdAtom = atom<string | null>((get) => {
  const client = get(xmtpClientAtom);
  return client?.inboxId ?? null;  // NOT accountAddress
});

// DM creation - always use inboxId
const dm = await client.conversations.findOrCreateDm(recipientInboxId);

// Check if message is own (compare inboxId, not address)
const isOwnMessage = message.senderInboxId === currentUserInboxId;

// Conversation active check before operations
if (!conversation.isActive()) {
  // Show read-only UI, disable send
}
```

### Message Ordering

Use `insertedAtNs` (NOT `sentAtNs`) for pagination:

```typescript
// Messages may arrive out of order - insertedAtNs provides stable ordering
const messages = await conversation.messages({
  sortBy: 'INSERTED',
  limit: 20,
  insertedBeforeNs: lastMessage.insertedAtNs,
});
```

### Consent States

- Automatic consent when user creates or receives messages in a conversation
- Consent syncs across devices via sync worker
- Imported conversations start inactive until reactivated

---

## World App Username API

The app resolves wallet addresses to human-readable usernames and profile pictures via the World App Username API.

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/{address}` | Resolve single address → `UsernameRecord` |
| `POST /api/v1/query` | Batch resolve addresses → `UsernameRecord[]` |
| `GET /api/v1/search/{prefix}` | Search usernames (max 10 results) |
| `GET /api/v1/avatar/{username}` | Redirect to profile picture |

**Base URL**: `https://usernames.worldcoin.org`

### UsernameRecord Schema

```typescript
interface UsernameRecord {
  address: `0x${string}`;                    // Checksummed wallet address
  username: string;                          // World App username
  profile_picture_url: string | null;        // Full-size avatar
  minimized_profile_picture_url: string | null; // Thumbnail avatar
}
```

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Component Layer                                             │
│  ├─ Avatar (address prop → auto-fetches profile picture)    │
│  ├─ ConversationItem (peerAddress → displays username)      │
│  └─ MessageRow (senderAddress → shows sender name)          │
├─────────────────────────────────────────────────────────────┤
│  Hook Layer                                                  │
│  ├─ useUsername(address) → { displayName, profilePicture }  │
│  └─ useBatchUsernames(addresses[]) → prefetch for lists     │
├─────────────────────────────────────────────────────────────┤
│  Store Layer (Jotai)                                         │
│  └─ usernameAtomFamily(address) → { record, isLoading }     │
├─────────────────────────────────────────────────────────────┤
│  Service Layer                                               │
│  ├─ resolveAddress(address) → single lookup                 │
│  ├─ resolveAddresses(addresses[]) → batch lookup            │
│  └─ LRU cache (500 entries, 5min TTL)                       │
└─────────────────────────────────────────────────────────────┘
```

### Usage Examples

```typescript
// In a component - automatic username/avatar lookup
<Avatar address={peerAddress} size="md" />
<ConversationItem peerAddress={peerAddress} lastMessage="Hello" />

// Manual username lookup with hook
const { displayName, profilePicture, isLoading } = useUsername(address);

// Batch prefetch for conversation list
useBatchUsernames(conversationAddresses);
```

### Key Files

| File | Purpose |
|------|---------|
| `types/username.ts` | TypeScript types from OpenAPI spec |
| `lib/username/service.ts` | API client with LRU caching |
| `stores/usernames.ts` | Jotai atoms for username state |
| `hooks/useUsername.ts` | React hook for components |

---

## Wallet & XMTP Integration

### Wallet Connection (wagmi)

```typescript
// lib/wagmi/config.ts - Wallet connectors configuration
// Supports: injected (MetaMask, etc.), Coinbase Wallet, WalletConnect

// components/providers/WagmiProvider.tsx - Wraps app with wagmi + react-query
// components/auth/ConnectWallet.tsx - Wallet connection UI
```

### XMTP Client Lifecycle

```typescript
// hooks/useXmtpClient.ts
const { client, isInitializing, isReady, error } = useXmtpClient();

// Auto-initializes when wallet connects
// Creates XMTP signer from viem WalletClient
// Stores client in Jotai atom for global access
```

### Creating Conversations

```typescript
// Use newDmWithIdentifier for creating DMs by address
const identifier: Identifier = {
  identifier: address.toLowerCase(),
  identifierKind: 'Ethereum',
};
const conversation = await client.conversations.newDmWithIdentifier(identifier);

// Check if address can receive messages first
const { canMessage } = useCanMessage();
const canReceive = await canMessage(address);
```

### App Flow

```
Landing Page (/)
  → Connect Wallet
  → Redirect to /chat
  → Initialize XMTP client (shows "Setting up secure messaging...")
  → Load conversations
  → Ready to chat
```

### Key Hooks

| Hook | Purpose |
|------|---------|
| `useXmtpClient()` | XMTP client lifecycle management |
| `useCanMessage()` | Check if address has XMTP enabled |
| `useConversations()` | Load and stream conversations |
| `useConversation(id)` | Get single conversation by ID |

---

## Directory Structure

```
/
├── app/
│   ├── layout.tsx          # Root layout + JotaiProvider
│   ├── page.tsx            # Redirects to /chat
│   └── chat/
│       ├── layout.tsx      # Full-height flex container
│       └── page.tsx        # Sidebar + MessagePanel/EmptyState
│
├── components/
│   ├── chat/
│   │   ├── Sidebar.tsx         # Left panel (search + conversation list)
│   │   ├── ConversationList.tsx # Virtualized list
│   │   ├── ConversationItem.tsx # Single conversation row
│   │   ├── ChatRequestsBanner.tsx
│   │   ├── MessagePanel.tsx    # Right panel (header + messages + input)
│   │   └── EmptyState.tsx      # Shown when no conversation selected
│   ├── ui/
│   │   ├── Avatar.tsx          # Letter/image avatar with color palette
│   │   └── VerificationBadge.tsx
│   └── providers/
│       └── JotaiProvider.tsx
│
├── stores/                 # Jotai atoms
│   ├── client.ts           # XMTP client state
│   ├── conversations.ts    # Conversation atoms + derived
│   ├── messages.ts         # Message atoms + pagination
│   ├── usernames.ts        # Username lookup atoms
│   └── ui.ts               # UI state (selection, modals, toasts)
│
├── hooks/
│   ├── useUsername.ts      # Username lookup hook
│   ├── useXmtpClient.ts    # XMTP client lifecycle
│   └── useConversations.ts # Conversation management
│
├── types/
│   ├── xmtp.ts             # XMTP type extensions
│   ├── messages.ts         # Message-related types
│   └── username.ts         # Username API types
│
├── lib/
│   ├── utils/
│   │   └── lru.ts          # LRU cache for memory management
│   ├── username/
│   │   └── service.ts      # Username API client with caching
│   └── wagmi/
│       └── config.ts       # Wallet connectors configuration
│
├── components/
│   ├── auth/
│   │   └── ConnectWallet.tsx   # Wallet connection UI
│   ├── chat/                   # Chat components (see below)
│
├── config/
│   └── constants.ts              # App constants ✅
│
└── next.config.ts                # Next.js configuration
```

---

## Next.js 16 Configuration

### next.config.ts

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // React Compiler for automatic memoization (stable in Next.js 16)
  reactCompiler: true,

  // Turbopack is now the default bundler
  // Configure if needed for WASM/native modules
  turbopack: {
    resolveAlias: {
      // Handle any Node.js modules that might be imported client-side
      fs: { browser: './lib/utils/empty.ts' },
    },
  },

  // Enable View Transitions for smooth navigation
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
```

### proxy.ts (Replaces middleware.ts)

```typescript
// proxy.ts - Next.js 16 network boundary handler
// Runs on Node.js runtime (not Edge)

import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect chat routes - redirect to home if no wallet connected
  if (pathname.startsWith('/chat')) {
    const walletConnected = request.cookies.get('wallet-connected');
    if (!walletConnected) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Rate limiting headers for API routes
  if (pathname.startsWith('/api')) {
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', '100');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/chat/:path*', '/api/:path*'],
};
```

### Cache Components Usage

```typescript
// app/chat/page.tsx - Using Cache Components for conversation list

'use cache'; // Opt-in to caching for this component

import { cacheLife } from 'next/cache';

export default async function ConversationListPage() {
  // Cache user profile data for 5 minutes
  cacheLife('minutes');
  
  return (
    <div>
      {/* ConversationList uses client-side Jotai state */}
      {/* Static shell is cached, dynamic content streams in */}
      <ConversationListShell />
    </div>
  );
}
```

### React 19.2 Features

```typescript
// Using View Transitions for conversation switching
import { useTransition } from 'react';
import { unstable_ViewTransition as ViewTransition } from 'react';

function ConversationSwitcher({ conversationId }: { conversationId: string }) {
  const [isPending, startTransition] = useTransition();

  const switchConversation = (newId: string) => {
    startTransition(() => {
      // Navigation wrapped in transition for smooth animation
      router.push(`/chat/${newId}`);
    });
  };

  return (
    <ViewTransition>
      <MessageList conversationId={conversationId} />
    </ViewTransition>
  );
}

// Using Activity for background conversation rendering
import { unstable_Activity as Activity } from 'react';

function ConversationTabs({ conversations }: { conversations: string[] }) {
  const [activeId, setActiveId] = useState(conversations[0]);

  return (
    <>
      {conversations.map((id) => (
        <Activity key={id} mode={id === activeId ? 'visible' : 'hidden'}>
          {/* Maintains state and cleans up effects when hidden */}
          <ConversationView conversationId={id} />
        </Activity>
      ))}
    </>
  );
}
```

---

## State Management Design

### Core Principle: Granular Subscriptions

**Problem with naive state:**
```typescript
// ❌ BAD: Every new message re-renders entire list
const [messages, setMessages] = useState<Message[]>([]);
setMessages([...messages, newMessage]); // O(n) re-renders
```

**Solution with Jotai atomFamily:**
```typescript
// ✅ GOOD: Only new message component renders
const messageAtomFamily = atomFamily((id: string) => atom<Message | null>(null));
// Adding new message = O(1) re-render
```

### Atom Structure

```typescript
// stores/messages.ts

import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { DecodedMessage } from '@xmtp/browser-sdk';

// Individual message atoms - granular updates
export const messageAtomFamily = atomFamily(
  (messageId: string) => atom<DecodedMessage | null>(null)
);

// Message IDs per conversation (just strings, not full messages)
export const conversationMessageIdsAtom = atomFamily(
  (conversationId: string) => atom<string[]>([])
);

// Pagination state per conversation
export const conversationPaginationAtom = atomFamily(
  (conversationId: string) => atom<{
    hasMore: boolean;
    oldestInsertedAtNs: bigint | null;
    isLoading: boolean;
  }>({
    hasMore: true,
    oldestInsertedAtNs: null,
    isLoading: false,
  })
);

// Pending (optimistic) messages
export const pendingMessagesAtom = atomFamily(
  (conversationId: string) => atom<PendingMessage[]>([])
);

// stores/conversations.ts

export const conversationAtomFamily = atomFamily(
  (conversationId: string) => atom<Conversation | null>(null)
);

export const conversationIdsAtom = atom<string[]>([]);

// Derived: sorted conversations by last activity
export const sortedConversationIdsAtom = atom((get) => {
  const ids = get(conversationIdsAtom);
  return [...ids].sort((a, b) => {
    const convA = get(conversationAtomFamily(a));
    const convB = get(conversationAtomFamily(b));
    if (!convA || !convB) return 0;
    return Number(convB.lastActivityNs - convA.lastActivityNs);
  });
});
```

---

## Message Loading & Streaming

### Pagination Strategy

**Use `insertedAtNs` for stable pagination:**

XMTP messages may arrive out of order (a message sent 5 minutes ago might arrive after one sent 1 minute ago). Using `insertedAtNs` (when the message was added to local DB) provides a totally ordered list.

```typescript
// hooks/useMessages.ts

const PAGE_SIZE = 50;

export function useMessages(conversationId: string) {
  const [messageIds, setMessageIds] = useAtom(
    conversationMessageIdsAtom(conversationId)
  );
  const [pagination, setPagination] = useAtom(
    conversationPaginationAtom(conversationId)
  );

  const loadMore = useCallback(async (conversation: Conversation) => {
    if (pagination.isLoading || !pagination.hasMore) return;

    setPagination(prev => ({ ...prev, isLoading: true }));

    try {
      const messages = await conversation.messages({
        limit: BigInt(PAGE_SIZE),
        insertedBeforeNs: pagination.oldestInsertedAtNs ?? undefined,
        direction: 'descending',
      });

      // Hydrate individual message atoms
      const newIds: string[] = [];
      for (const msg of messages) {
        messageAtomFamily(msg.id).init = msg;
        newIds.push(msg.id);
      }

      setMessageIds(prev => [...prev, ...newIds]);
      setPagination({
        hasMore: messages.length === PAGE_SIZE,
        oldestInsertedAtNs: messages.at(-1)?.insertedAtNs ?? null,
        isLoading: false,
      });
    } catch (error) {
      setPagination(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [pagination, setMessageIds, setPagination]);

  return { messageIds, loadMore, ...pagination };
}
```

### Real-Time Streaming

```typescript
// hooks/useMessageStream.ts

export function useMessageStream(
  client: Client | null,
  conversationId: string
) {
  const setMessageIds = useSetAtom(conversationMessageIdsAtom(conversationId));

  useEffect(() => {
    if (!client) return;

    let mounted = true;
    let stream: AsyncIterable<DecodedMessage>;

    async function startStream() {
      const conversation = await client.conversations.getConversationById(
        conversationId
      );
      if (!conversation || !mounted) return;

      stream = await conversation.stream();

      for await (const message of stream) {
        if (!mounted) break;

        // Hydrate single message atom (no list re-render)
        messageAtomFamily(message.id).init = message;

        // Prepend ID to list
        setMessageIds(prev => [message.id, ...prev]);
      }
    }

    startStream();

    return () => {
      mounted = false;
    };
  }, [client, conversationId, setMessageIds]);
}
```

---

## Virtualization Implementation

### Message List

```typescript
// components/chat/MessageList.tsx

import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtomValue } from 'jotai';
import { useRef, useEffect } from 'react';

interface MessageListProps {
  conversationId: string;
  onLoadMore: () => void;
  hasMore: boolean;
}

export function MessageList({ conversationId, onLoadMore, hasMore }: MessageListProps) {
  const messageIds = useAtomValue(conversationMessageIdsAtom(conversationId));
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messageIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Estimated message height
    overscan: 10, // Render 10 extra items above/below viewport
    getItemKey: (index) => messageIds[index],
  });

  // Infinite scroll - load more when near top
  useEffect(() => {
    const [firstItem] = virtualizer.getVirtualItems();
    if (firstItem?.index === 0 && hasMore) {
      onLoadMore();
    }
  }, [virtualizer.getVirtualItems(), hasMore, onLoadMore]);

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto flex flex-col-reverse"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <MessageRow
            key={virtualRow.key}
            messageId={messageIds[virtualRow.index]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

### Individual Message Component

```typescript
// components/chat/MessageRow.tsx

// Note: React Compiler (enabled in next.config.ts) automatically memoizes
// this component - no need for manual memo() wrapper in Next.js 16

import { useAtomValue } from 'jotai';

interface MessageRowProps {
  messageId: string;
  style: React.CSSProperties;
}

// React Compiler automatically detects this should be memoized
// based on props usage - only re-renders when THIS message's atom changes
export function MessageRow({ messageId, style }: MessageRowProps) {
  const message = useAtomValue(messageAtomFamily(messageId));

  if (!message) return null;

  const isOwnMessage = message.senderInboxId === currentUserInboxId;

  return (
    <div style={style} className="px-4 py-2">
      <div className={cn(
        "flex gap-3",
        isOwnMessage && "flex-row-reverse"
      )}>
        <Avatar address={message.senderAddress} />
        <div className={cn(
          "max-w-[70%] rounded-2xl px-4 py-2",
          isOwnMessage 
            ? "bg-blue-500 text-white" 
            : "bg-gray-100 text-gray-900"
        )}>
          <MessageContent message={message} />
          <MessageMeta message={message} />
        </div>
      </div>
    </div>
  );
}
```

---

## Optimistic Updates

```typescript
// hooks/useSendMessage.ts

interface PendingMessage {
  id: string;
  content: string;
  status: 'sending' | 'failed';
  sentAtNs: bigint;
}

export function useSendMessage(conversationId: string) {
  const setPending = useSetAtom(pendingMessagesAtom(conversationId));
  const setMessageIds = useSetAtom(conversationMessageIdsAtom(conversationId));

  const send = useCallback(async (
    conversation: Conversation,
    content: string
  ) => {
    const tempId = `pending-${Date.now()}-${Math.random()}`;

    // 1. Optimistic update - show immediately
    const pending: PendingMessage = {
      id: tempId,
      content,
      status: 'sending',
      sentAtNs: BigInt(Date.now()) * 1_000_000n,
    };

    setPending(prev => [...prev, pending]);

    try {
      // 2. Actually send via XMTP
      const sentMessage = await conversation.send(content);

      // 3. Replace pending with real message
      messageAtomFamily(sentMessage.id).init = sentMessage;
      setMessageIds(prev => [sentMessage.id, ...prev]);
      setPending(prev => prev.filter(p => p.id !== tempId));

    } catch (error) {
      // 4. Mark as failed (allow retry)
      setPending(prev =>
        prev.map(p =>
          p.id === tempId ? { ...p, status: 'failed' } : p
        )
      );
      throw error;
    }
  }, [setPending, setMessageIds]);

  return send;
}
```

---

## Optional Encryption Layer

### When to Use

| Scenario | Recommendation |
|----------|----------------|
| Consumer chat app | Skip (XMTP E2EE is sufficient) |
| Enterprise/compliance | Add encryption layer |
| Healthcare/financial | Add encryption layer |
| High-security use cases | Add encryption + WebAuthn keys |

### Implementation

```typescript
// lib/crypto/encryption.ts

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

export class LocalEncryption {
  private key: CryptoKey | null = null;
  private salt: Uint8Array | null = null;

  async initialize(password: string): Promise<void> {
    // Get or create salt
    const storedSalt = localStorage.getItem('xmtp-encryption-salt');
    if (storedSalt) {
      this.salt = Uint8Array.from(atob(storedSalt), c => c.charCodeAt(0));
    } else {
      this.salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
      localStorage.setItem('xmtp-encryption-salt', btoa(String.fromCharCode(...this.salt)));
    }

    // Derive key from password
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    this.key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: this.salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: ALGORITHM, length: KEY_LENGTH },
      false, // Non-extractable
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(plaintext: string): Promise<string> {
    if (!this.key) throw new Error('Encryption not initialized');

    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      this.key,
      encoder.encode(plaintext)
    );

    // Pack IV + ciphertext as base64
    const packed = new Uint8Array(iv.length + ciphertext.byteLength);
    packed.set(iv);
    packed.set(new Uint8Array(ciphertext), iv.length);
    
    return btoa(String.fromCharCode(...packed));
  }

  async decrypt(packed: string): Promise<string> {
    if (!this.key) throw new Error('Encryption not initialized');

    const data = Uint8Array.from(atob(packed), c => c.charCodeAt(0));
    const iv = data.slice(0, IV_LENGTH);
    const ciphertext = data.slice(IV_LENGTH);

    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      this.key,
      ciphertext
    );

    return new TextDecoder().decode(plaintext);
  }

  isInitialized(): boolean {
    return this.key !== null;
  }

  clear(): void {
    this.key = null;
    this.salt = null;
  }
}
```

---

## Memory Management

### LRU Cache for Messages

```typescript
// lib/utils/lru.ts

export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;
  private onEvict?: (key: K, value: V) => void;

  constructor(maxSize: number, onEvict?: (key: K, value: V) => void) {
    this.maxSize = maxSize;
    this.onEvict = onEvict;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first item)
      const firstKey = this.cache.keys().next().value;
      const firstValue = this.cache.get(firstKey)!;
      this.cache.delete(firstKey);
      this.onEvict?.(firstKey, firstValue);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Usage with Jotai
const messageCache = new LRUCache<string, DecodedMessage>(
  1000, // Keep 1000 messages in memory
  (messageId) => {
    // Clean up atom when evicted
    messageAtomFamily.remove(messageId);
  }
);
```

---

## XMTP Client Initialization

```typescript
// lib/xmtp/client.ts

import { Client, type Signer } from '@xmtp/browser-sdk';

export interface XMTPClientOptions {
  env?: 'production' | 'dev' | 'local';
  appVersion?: string;
}

export async function createXMTPClient(
  signer: Signer,
  options: XMTPClientOptions = {}
): Promise<Client> {
  const { env = 'production', appVersion = '1.0.0' } = options;

  const client = await Client.create(signer, {
    env,
    appVersion,
    // Browser SDK doesn't support dbEncryptionKey
    // History sync is enabled by default
  });

  return client;
}

// hooks/useXMTPClient.ts

export function useXMTPClient() {
  const [client, setClient] = useAtom(xmtpClientAtom);
  const { data: signer } = useWalletClient(); // From wagmi

  useEffect(() => {
    if (!signer) {
      setClient(null);
      return;
    }

    let mounted = true;

    createXMTPClient(signer)
      .then((c) => {
        if (mounted) setClient(c);
      })
      .catch(console.error);

    return () => {
      mounted = false;
    };
  }, [signer, setClient]);

  return client;
}
```

---

## Performance Targets

| Metric | Target | How to Achieve |
|--------|--------|----------------|
| Time to Interactive | < 2s | Code splitting, minimal initial JS |
| Message list scroll | 60fps | Virtualization, React Compiler auto-memo |
| New message render | < 16ms | Granular atom updates |
| Memory (10k messages) | < 50MB | LRU cache, atom eviction |
| Initial message load | < 500ms | Pagination, parallel requests |
| Dev server startup | < 1s | Turbopack (default in Next.js 16) |
| Fast Refresh | < 100ms | Turbopack (5-10x faster than Webpack) |
| Production build | < 30s | Turbopack builds + file system caching |

---

## Debugging with Next.js DevTools MCP

Next.js 16 includes DevTools MCP (Model Context Protocol) for AI-assisted debugging. Configure in your MCP client:

```json
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  }
}
```

Use natural language prompts like:
- "Why is this component re-rendering?"
- "Show me the route structure of my app"
- "Help me debug this hydration error"

---

## Security Considerations

### What XMTP Provides (Free)

- ✅ End-to-end encryption via MLS
- ✅ Forward secrecy with key rotation
- ✅ Message integrity verification
- ✅ Sender authentication

### Browser Limitations

- ⚠️ XMTP Browser SDK does NOT encrypt local IndexedDB
- ⚠️ Same-origin policy is primary protection
- ⚠️ Other JS on same origin could access data
- ⚠️ No hardware-backed key storage (unlike mobile)

### Recommendations

1. **For most apps**: Trust XMTP + browser same-origin policy
2. **For sensitive apps**: Add the optional encryption layer
3. **Always recommend**: Users enable OS disk encryption
4. **Never store**: Wallet private keys (use external signers)

---

## Testing Strategy

```typescript
// Recommended testing setup for Next.js 16

// Unit tests: Vitest
// - State management logic
// - Encryption utilities
// - Formatting helpers

// Component tests: Testing Library
// - MessageRow rendering
// - ConversationList behavior
// - Input handling

// E2E tests: Playwright
// - Full message flow
// - Wallet connection
// - Multi-device sync

// Linting: Biome (next lint removed in Next.js 16)
// - Fast, single-tool for lint + format
// - Configure in biome.json

// Type checking: tsc --noEmit
// - Run separately from build

// Performance tests: Lighthouse CI
// - Bundle size monitoring (use new Bundle Analyzer in 16.1)
// - Core Web Vitals
```

---

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server (Turbopack enabled by default)
pnpm dev

# Build for production (Turbopack builds)
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint (using Biome - next lint removed in Next.js 16)
pnpm lint

# Upgrade Next.js (new in 16.1)
npx next upgrade

# Debug with inspector (new in 16.1)
pnpm dev --inspect
```

---

## Breaking Changes from Next.js 15

If migrating from Next.js 15, note these changes:

| Change | Migration |
|--------|-----------|
| `middleware.ts` → `proxy.ts` | Rename file, rename export to `proxy` |
| `next lint` removed | Use Biome or ESLint directly |
| Async `params`/`searchParams` | Add `await` to page props access |
| Node.js minimum 20.9.0 | Upgrade Node.js |
| React Compiler stable | Enable with `reactCompiler: true` |
| Implicit caching removed | Add `"use cache"` where needed |

---

## Key Implementation Notes

1. **Always use `insertedAtNs` for pagination** - provides stable ordering
2. **React Compiler handles memoization** - no need for manual `memo()`, `useCallback`, `useMemo` in most cases
3. **Keep message IDs separate from message data** - enables granular updates
4. **Use atomFamily for per-entity state** - O(1) updates instead of O(n)
5. **Implement optimistic updates** - perceived performance matters
6. **Set overscan in virtualizer** - prevents blank flashes during scroll
7. **Clean up streams on unmount** - prevent memory leaks
8. **Use enrichedMessages() for reactions/replies** - single query instead of many
9. **Use `"use cache"` explicitly** - Next.js 16 has no implicit caching
10. **Use View Transitions** - smooth conversation switching animations
11. **Use Activity for tab-like UIs** - maintains state when switching conversations
12. **proxy.ts runs on Node.js** - can use Node APIs unlike old Edge middleware

---

## References

- [XMTP Documentation](https://docs.xmtp.org)
- [XMTP Browser SDK](https://github.com/xmtp/xmtp-js)
- [libxmtp](https://github.com/xmtp/libxmtp)
- [Next.js 16 Release Notes](https://nextjs.org/blog/next-16)
- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [React 19.2 Announcement](https://react.dev/blog)
- [React Compiler](https://react.dev/learn/react-compiler)
- [Jotai Documentation](https://jotai.org)
- [TanStack Virtual](https://tanstack.com/virtual)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Biome (replaces ESLint in Next.js 16)](https://biomejs.dev)


## Design System

### Colors (from Figma)

| Token | Hex | Usage |
|-------|-----|-------|
| Grey/900 | `#181818` | Primary text |
| Grey/500 | `#717680` | Secondary text, previews |
| Grey/400 | `#9BA3AE` | Muted text, timestamps |
| Grey/100 | `#F5F5F5` | Backgrounds |
| Info/600 | `#005CFF` | Selected state, links, badges |
| Success/600 | `#00C230` | Online status |
| Success/200 | `#CCF3D9` | Avatar backgrounds |

### Avatar Colors

```typescript
const AVATAR_COLORS = [
  { bg: '#CCF3D9', text: '#00C230' }, // Green
  { bg: '#CCE5FF', text: '#005CFF' }, // Blue
  { bg: '#FFE5CC', text: '#FF8C00' }, // Orange
  { bg: '#FFCCCC', text: '#FF3333' }, // Red
  { bg: '#E5CCFF', text: '#9933FF' }, // Purple
  { bg: '#CCFFFF', text: '#00CCCC' }, // Cyan
  { bg: '#FFFFCC', text: '#CCCC00' }, // Yellow
  { bg: '#FFCCE5', text: '#FF3399' }, // Pink
];
```

#### Typography

| Style | Font | Size | Weight | Line Height |
|-------|------|------|--------|-------------|
| Title | System | 22px | 600 | 1.2 |
| Subtitle/S2 | World Pro MVP | 17px | 500 | 1.2 |
| Body/B3 | World Pro MVP | 15px | 325 | 1.3 |

**Note:** We use system fonts (Geist) as fallback since World Pro MVP is proprietary.

#### Spacing & Sizing

| Element | Size |
|---------|------|
| Sidebar width | 320px (lg: 380px) |
| Avatar sm/md/lg | 36px / 52px / 72px |
| Conversation item height | 56px (desktop) |
| Message row estimate | 72px |

### ConversationItem Selected State

- Background: `#005CFF` (hover: `#0052E0`)
- Text: white, secondary text: `white/70`
- Unread badge: inverted (white bg, blue text)

---

## Figma Design References

| Screen | Node ID | URL |
|--------|---------|-----|
| Conversation List | `148945:77900` | [Link](https://www.figma.com/design/s0BDDd8s4RGxcaA9bpKUlN/%F0%9F%8F%B0-World-App-4.0--Handoff-?node-id=148945-77900&m=dev) |
| Conversation View | `138629:71232` | [Link](https://www.figma.com/design/s0BDDd8s4RGxcaA9bpKUlN/%F0%9F%8F%B0-World-App-4.0--Handoff-?node-id=138629-71232&m=dev) |
| Payments & Link Preview | `138629:71230` | [Link](https://www.figma.com/design/s0BDDd8s4RGxcaA9bpKUlN/%F0%9F%8F%B0-World-App-4.0--Handoff-?node-id=138629-71230&m=dev) |

**Note**: Figma designs are mobile-first. Adapt to desktop split-pane layout.

---

## Key Implementation Decisions

1. **Desktop-first layout** - Split-pane like Telegram, not mobile stacked view
2. **Jotai atomFamily** - Granular subscriptions for O(1) message updates
3. **Virtualization** - @tanstack/react-virtual for large lists
4. **Selected state in Jotai** - `selectedConversationIdAtom` drives which panel shows
5. **LRU cache** - Evict old messages from memory (max 1000)
6. **Optimistic updates** - Show pending messages immediately
7. **XMTP insertedAtNs** - Use for pagination (stable ordering vs sentAtNs)

---

**ChatHeader:**
- Three-column layout: scan | title | profile
- Search bar below with rounded-xl corners

**Responsive Behavior:**
- Mobile: Full-width, max-w-md centered on larger screens
- Desktop: Consider sidebar + main content split (TODO)