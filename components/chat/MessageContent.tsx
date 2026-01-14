'use client';

import { useMemo, type ReactNode } from 'react';
import { LinkPreview, extractUrls } from './LinkPreview';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { isSupportedTicker } from '@/config/tickers';

interface MessageTextProps {
  text: string;
  isOwnMessage: boolean;
  /** Callback when a ticker symbol is clicked */
  onTickerClick?: (symbol: string) => void;
}

// Regex patterns
const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
const TICKER_PATTERN = /\$([A-Za-z]{1,5})\b/g; // Case-insensitive

// Component to render just the text content with clickable links and tickers
export function MessageText({ text, isOwnMessage, onTickerClick }: MessageTextProps) {
  // Render text with clickable links and highlighted tickers
  const formattedText = useMemo(() => {
    // Find all URLs and tickers with their positions
    const matches: Array<{
      type: 'url' | 'ticker';
      match: string;
      symbol?: string;
      start: number;
      end: number;
    }> = [];

    // Find URLs
    let urlMatch;
    const urlRegex = new RegExp(URL_PATTERN.source, 'gi');
    while ((urlMatch = urlRegex.exec(text)) !== null) {
      matches.push({
        type: 'url',
        match: urlMatch[0],
        start: urlMatch.index,
        end: urlMatch.index + urlMatch[0].length,
      });
    }

    // Find tickers
    let tickerMatch;
    const tickerRegex = new RegExp(TICKER_PATTERN.source, 'g');
    while ((tickerMatch = tickerRegex.exec(text)) !== null) {
      const symbol = tickerMatch[1].toUpperCase(); // Normalize to uppercase
      // Only highlight supported tickers
      if (isSupportedTicker(symbol)) {
        matches.push({
          type: 'ticker',
          match: tickerMatch[0],
          symbol,
          start: tickerMatch.index,
          end: tickerMatch.index + tickerMatch[0].length,
        });
      }
    }

    // If no matches, return plain text
    if (matches.length === 0) return text;

    // Sort by position
    matches.sort((a, b) => a.start - b.start);

    // Build parts array
    const parts: ReactNode[] = [];
    let lastIndex = 0;

    for (const m of matches) {
      // Skip if this match overlaps with previous (e.g., ticker inside URL)
      if (m.start < lastIndex) continue;

      // Add text before this match
      if (m.start > lastIndex) {
        parts.push(text.slice(lastIndex, m.start));
      }

      if (m.type === 'url') {
        // Render URL as link
        parts.push(
          <a
            key={`url-${m.start}`}
            href={m.match}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline break-all ${
              isOwnMessage
                ? 'text-white hover:text-white/80'
                : 'text-[var(--accent-blue)] hover:opacity-80'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {m.match}
          </a>
        );
      } else if (m.type === 'ticker' && m.symbol) {
        // Render ticker as clickable highlighted span
        parts.push(
          <span
            key={`ticker-${m.start}`}
            role="button"
            tabIndex={0}
            className={`font-medium cursor-pointer ${
              isOwnMessage
                ? 'text-white/90 hover:text-white underline decoration-white/40'
                : 'text-[var(--accent-blue)] hover:opacity-80'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onTickerClick?.(m.symbol!);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTickerClick?.(m.symbol!);
              }
            }}
          >
            {m.match}
          </span>
        );
      }

      lastIndex = m.end;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  }, [text, isOwnMessage, onTickerClick]);

  return (
    <p
      className={`text-[15px] leading-[1.35] whitespace-pre-wrap break-words ${
        isOwnMessage ? 'text-white' : 'text-[var(--text-primary)]'
      }`}
    >
      {formattedText}
    </p>
  );
}

interface MessageLinkPreviewProps {
  text: string;
  isOwnMessage: boolean;
}

// Component to render link preview for a message (renders outside the bubble)
export function MessageLinkPreview({ text, isOwnMessage }: MessageLinkPreviewProps) {
  // Extract URLs from text
  const urls = useMemo(() => extractUrls(text), [text]);

  // Only show preview for the first URL to avoid cluttering
  const firstUrl = urls[0] ?? null;
  const { metadata, isLoading } = useLinkPreview(firstUrl);

  if (!firstUrl) return null;

  return (
    <LinkPreview
      metadata={metadata}
      isLoading={isLoading}
      isOwnMessage={isOwnMessage}
    />
  );
}

// Legacy export for backward compatibility
interface MessageContentProps {
  text: string;
  isOwnMessage: boolean;
}

export function MessageContent({ text, isOwnMessage }: MessageContentProps) {
  return (
    <div>
      <MessageText text={text} isOwnMessage={isOwnMessage} />
      <MessageLinkPreview text={text} isOwnMessage={isOwnMessage} />
    </div>
  );
}
