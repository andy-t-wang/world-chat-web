import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Link preview setting - persisted to localStorage
export const linkPreviewEnabledAtom = atomWithStorage('link-preview-enabled', true);

// Settings panel open state
export const settingsPanelOpenAtom = atom(false);
