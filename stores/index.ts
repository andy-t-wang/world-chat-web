/**
 * State Store Exports
 * Central export point for all Jotai atoms
 */

// Client state
export {
  xmtpClientAtom,
  clientStateAtom,
  isClientReadyAtom,
  currentInboxIdAtom,
  currentAccountIdentifierAtom,
  clientLifecycleAtom,
} from './client';

// Message state
export {
  messageAtomFamily,
  conversationMessageIdsAtom,
  conversationPaginationAtom,
  pendingMessagesAtom,
  allMessageIdsAtom,
  messageCountAtom,
  messageCache,
  addMessageToStore,
  createPendingMessage,
  hasPendingMessagesAtom,
  hasFailedMessagesAtom,
} from './messages';

// Conversation state
export {
  conversationAtomFamily,
  conversationMetadataAtom,
  conversationIdsAtom,
  isLoadingConversationsAtom,
  conversationsErrorAtom,
  sortedConversationIdsAtom,
  unreadConversationIdsAtom,
  totalUnreadCountAtom,
  conversationConsentAtom,
  conversationsByConsentAtom,
  conversationSearchQueryAtom,
  filteredConversationIdsAtom,
  conversationsPaginationAtom,
  conversationWithMetadataAtom,
} from './conversations';

// UI state
export {
  selectedConversationIdAtom,
  isSidebarOpenAtom,
  isMobileViewAtom,
  activeModalAtom,
  modalDataAtom,
  openModalAtom,
  closeModalAtom,
  messageInputDraftAtom,
  isTypingAtom,
  othersTypingAtom,
  scrollPositionAtom,
  autoScrollEnabledAtom,
  toastsAtom,
  addToastAtom,
  removeToastAtom,
  themeAtom,
  resolvedThemeAtom,
  isAppLoadingAtom,
  globalErrorAtom,
  isOnlineAtom,
  isReconnectingAtom,
} from './ui';
export type { ModalType, Toast, Theme } from './ui';
