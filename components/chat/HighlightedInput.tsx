'use client';

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { extractTickers, type TickerType } from '@/lib/ticker/utils';
import { TickerPreview } from './TickerPreview';
import type { TickerPriceData } from '@/app/api/ticker-price/route';
import { customNicknamesAtom } from '@/stores/nicknames';
import { getCachedUsername } from '@/lib/username/service';
import { useUsername } from '@/hooks/useUsername';
import { Avatar } from '@/components/ui/Avatar';

export interface MemberPreview {
  inboxId: string;
  address: string;
}

interface HighlightedInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  onTickerClick?: (symbol: string, type: TickerType, data: TickerPriceData) => void;
  /** Members for @mention autocomplete (group chats) */
  members?: MemberPreview[];
  /** Current user's inbox ID (to exclude from suggestions) */
  currentInboxId?: string;
}

export interface HighlightedInputRef {
  focus: () => void;
  blur: () => void;
}

// Regex to match tickers ($ for crypto, # for stocks)
// Note: Use separate regex for test vs exec to avoid lastIndex issues with global flag
const TICKER_PATTERN = /([#$])([A-Za-z]{1,10})\b/g;
const TICKER_TEST_PATTERN = /([#$])([A-Za-z]{1,10})\b/;

// Single member suggestion row
function MemberSuggestion({
  member,
  nickname,
  isSelected,
  onClick,
}: {
  member: MemberPreview;
  nickname?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { displayName: username, profilePicture } = useUsername(member.address);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
        isSelected ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'
      }`}
    >
      <Avatar
        address={member.address}
        size="sm"
        className="w-8 h-8"
        imageUrl={profilePicture || undefined}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)] truncate">
          {nickname || username}
        </div>
        {nickname && (
          <div className="text-xs text-[var(--text-tertiary)] truncate">
            @{username}
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Textarea with highlighted ticker symbols
 * Uses overlay technique: invisible text in textarea, visible highlighted text behind
 */
export const HighlightedInput = forwardRef<HighlightedInputRef, HighlightedInputProps>(
  ({ value, onChange, onKeyDown, placeholder, disabled, onTickerClick, members, currentInboxId }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const customNicknames = useAtomValue(customNicknamesAtom);

    // Ticker preview popup state
    const [tickerPopup, setTickerPopup] = useState<{
      symbol: string;
      type: TickerType;
      position: { x: number; y: number };
    } | null>(null);

    // @mention autocomplete state
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

    // Filter members based on mention query (excluding self)
    const filteredMembers = useMemo(() => {
      if (mentionQuery === null || !members) return [];

      const query = mentionQuery.toLowerCase();
      return members
        .filter((m) => m.inboxId !== currentInboxId) // Exclude self
        .filter((m) => {
          if (!query) return true; // Show all if just "@"

          // Check nickname
          const nickname = customNicknames[m.address.toLowerCase()];
          if (nickname?.toLowerCase().includes(query)) return true;

          // Check cached username
          const cached = getCachedUsername(m.address);
          if (cached?.username?.toLowerCase().includes(query)) return true;

          // Check address
          if (m.address.toLowerCase().includes(query)) return true;

          return false;
        })
        .slice(0, 5); // Limit to 5 suggestions
    }, [members, mentionQuery, currentInboxId, customNicknames]);

    // Reset selected index when filtered results change
    useEffect(() => {
      setSelectedMentionIndex(0);
    }, [filteredMembers.length]);

    // Detect @ trigger while typing
    const detectMention = useCallback((text: string, cursorPos: number) => {
      // Look backwards from cursor to find @
      let atIndex = -1;
      for (let i = cursorPos - 1; i >= 0; i--) {
        const char = text[i];
        if (char === '@') {
          // Check if this @ is at start or preceded by whitespace
          if (i === 0 || /\s/.test(text[i - 1])) {
            atIndex = i;
            break;
          }
        }
        // Stop if we hit whitespace (no @ in this word)
        if (/\s/.test(char)) break;
      }

      if (atIndex >= 0) {
        const query = text.slice(atIndex + 1, cursorPos);
        // Only show if query doesn't contain spaces
        if (!query.includes(' ')) {
          setMentionQuery(query);
          setMentionStartIndex(atIndex);
          return;
        }
      }

      // No valid mention trigger
      setMentionQuery(null);
      setMentionStartIndex(-1);
    }, []);

    // Handle mention selection
    const handleMentionSelect = useCallback((member: MemberPreview) => {
      const cached = getCachedUsername(member.address);
      const username = cached?.username || member.address.slice(0, 10);

      // Replace @query with @username
      const before = value.slice(0, mentionStartIndex);
      const after = value.slice(mentionStartIndex + 1 + (mentionQuery?.length || 0));
      const newValue = `${before}@${username} ${after}`;

      onChange(newValue);
      setMentionQuery(null);
      setMentionStartIndex(-1);

      // Focus and set cursor after the inserted mention
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = before.length + username.length + 2; // +2 for @ and space
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }, [value, mentionStartIndex, mentionQuery, onChange]);

    // Expose focus/blur methods
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      blur: () => textareaRef.current?.blur(),
    }));

    // Sync scroll between textarea and overlay
    const syncScroll = useCallback(() => {
      if (textareaRef.current && overlayRef.current) {
        overlayRef.current.scrollTop = textareaRef.current.scrollTop;
        overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
    }, []);

    // Auto-resize textarea
    const autoResize = useCallback(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + 'px';
      }
    }, []);

    useEffect(() => {
      autoResize();
    }, [value, autoResize]);

    // Handle ticker click in overlay
    const handleTickerClick = useCallback((
      e: React.MouseEvent,
      symbol: string,
      type: TickerType
    ) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();

      if (containerRect) {
        setTickerPopup({
          symbol,
          type,
          position: {
            x: rect.left - containerRect.left + rect.width / 2,
            y: rect.top - containerRect.top - 8, // Position above the ticker
          },
        });
      }
    }, []);

    // Close popup when clicking outside
    useEffect(() => {
      if (!tickerPopup) return;

      const handleClick = () => setTickerPopup(null);
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }, [tickerPopup]);

    // Render highlighted text with clickable tickers
    const renderHighlightedText = useCallback(() => {
      if (!value) return null;

      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;
      const regex = new RegExp(TICKER_PATTERN.source, 'g');

      while ((match = regex.exec(value)) !== null) {
        // Add text before ticker
        if (match.index > lastIndex) {
          parts.push(
            <span key={`text-${lastIndex}`}>
              {value.slice(lastIndex, match.index)}
            </span>
          );
        }

        // Add highlighted ticker
        const prefix = match[1] as '$' | '#';
        const symbol = match[2].toUpperCase();
        const type: TickerType = prefix === '$' ? 'crypto' : 'stock';

        parts.push(
          <span
            key={`ticker-${match.index}`}
            className="text-[var(--accent-blue)] cursor-pointer hover:underline pointer-events-auto"
            onClick={(e) => handleTickerClick(e, symbol, type)}
          >
            {match[0]}
          </span>
        );

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      if (lastIndex < value.length) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {value.slice(lastIndex)}
          </span>
        );
      }

      return parts;
    }, [value, handleTickerClick]);

    const hasTickers = TICKER_TEST_PATTERN.test(value);

    return (
      <div ref={containerRef} className="relative flex-1 min-w-0">
        {/* Actual textarea - at the bottom layer for typing */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            const newValue = e.target.value;
            onChange(newValue);
            autoResize();
            // Detect @mention trigger
            if (members && members.length > 0) {
              detectMention(newValue, e.target.selectionStart);
            }
          }}
          onKeyDown={(e) => {
            // Handle mention autocomplete keyboard navigation
            if (mentionQuery !== null && filteredMembers.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedMentionIndex((prev) =>
                  prev < filteredMembers.length - 1 ? prev + 1 : 0
                );
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedMentionIndex((prev) =>
                  prev > 0 ? prev - 1 : filteredMembers.length - 1
                );
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                handleMentionSelect(filteredMembers[selectedMentionIndex]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setMentionQuery(null);
                setMentionStartIndex(-1);
                return;
              }
            }
            // Pass through to parent handler
            onKeyDown(e);
          }}
          onScroll={syncScroll}
          placeholder={hasTickers ? '' : placeholder}
          rows={1}
          disabled={disabled}
          className={`relative w-full px-4 py-2.5 bg-[var(--bg-hover)] border border-[var(--border-default)] rounded-2xl outline-none resize-none leading-[1.4] transition-all scrollbar-hide ${
            hasTickers
              ? 'text-transparent caret-[var(--text-primary)]'
              : 'text-[var(--text-primary)] placeholder-[var(--text-quaternary)]'
          }`}
          style={{ minHeight: '44px', maxHeight: '128px' }}
        />

        {/* Highlighted overlay - on top for display and ticker clicks */}
        {hasTickers && (
          <div
            ref={overlayRef}
            className="absolute inset-0 px-4 py-2.5 border border-transparent rounded-2xl text-[var(--text-primary)] leading-[1.4] overflow-hidden pointer-events-none whitespace-pre-wrap break-words"
            style={{ minHeight: '44px', maxHeight: '128px' }}
            aria-hidden="true"
          >
            {renderHighlightedText()}
          </div>
        )}

        {/* Ticker preview popup */}
        {tickerPopup && (
          <div
            className="absolute z-50 transform -translate-x-1/2"
            style={{
              left: tickerPopup.position.x,
              bottom: '100%',
              marginBottom: '8px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <TickerPreview
              symbol={tickerPopup.symbol}
              type={tickerPopup.type}
              onOpenModal={(symbol, type, data) => {
                setTickerPopup(null);
                onTickerClick?.(symbol, type, data);
              }}
            />
          </div>
        )}

        {/* @mention autocomplete dropdown */}
        {mentionQuery !== null && filteredMembers.length > 0 && (
          <div
            className="absolute left-0 right-0 z-50 bg-[var(--bg-primary)] rounded-xl shadow-lg border border-[var(--border-subtle)] py-1 max-h-[200px] overflow-y-auto"
            style={{
              bottom: '100%',
              marginBottom: '8px',
            }}
          >
            {filteredMembers.map((member, index) => (
              <MemberSuggestion
                key={member.inboxId}
                member={member}
                nickname={customNicknames[member.address.toLowerCase()]}
                isSelected={index === selectedMentionIndex}
                onClick={() => handleMentionSelect(member)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

HighlightedInput.displayName = 'HighlightedInput';
