'use client';

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { extractTickers, type TickerType } from '@/lib/ticker/utils';
import { TickerPreview } from './TickerPreview';
import type { TickerPriceData } from '@/app/api/ticker-price/route';

interface HighlightedInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  onTickerClick?: (symbol: string, type: TickerType, data: TickerPriceData) => void;
}

export interface HighlightedInputRef {
  focus: () => void;
  blur: () => void;
}

// Regex to match tickers ($ for crypto, # for stocks)
// Note: Use separate regex for test vs exec to avoid lastIndex issues with global flag
const TICKER_PATTERN = /([#$])([A-Za-z]{1,10})\b/g;
const TICKER_TEST_PATTERN = /([#$])([A-Za-z]{1,10})\b/;

/**
 * Textarea with highlighted ticker symbols
 * Uses overlay technique: invisible text in textarea, visible highlighted text behind
 */
export const HighlightedInput = forwardRef<HighlightedInputRef, HighlightedInputProps>(
  ({ value, onChange, onKeyDown, placeholder, disabled, onTickerClick }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Ticker preview popup state
    const [tickerPopup, setTickerPopup] = useState<{
      symbol: string;
      type: TickerType;
      position: { x: number; y: number };
    } | null>(null);

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
            onChange(e.target.value);
            autoResize();
          }}
          onKeyDown={onKeyDown}
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
      </div>
    );
  }
);

HighlightedInput.displayName = 'HighlightedInput';
