import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Link preview setting - persisted to localStorage
export const linkPreviewEnabledAtom = atomWithStorage('link-preview-enabled', true);

// Sound muted setting - persisted to localStorage
export const soundMutedAtom = atomWithStorage('sound-muted', false);

// Settings panel open state
export const settingsPanelOpenAtom = atom(false);

// Seen message request IDs - persisted to localStorage
// These are request IDs that the user has viewed (opened the message requests panel)
export const seenRequestIdsAtom = atomWithStorage<string[]>('seen-request-ids', []);
