import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Link preview setting - persisted to localStorage
export const linkPreviewEnabledAtom = atomWithStorage('link-preview-enabled', true);

// Sound muted setting - persisted to localStorage
export const soundMutedAtom = atomWithStorage('sound-muted', false);

// Settings panel open state
export const settingsPanelOpenAtom = atom(false);

// Timestamps when message requests were first seen - persisted to localStorage
// Used to show a "new" dot for 5 seconds after a request appears
export const requestFirstSeenAtom = atomWithStorage<Record<string, number>>('request-first-seen', {});
