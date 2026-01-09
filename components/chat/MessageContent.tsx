'use client';

import { useMemo, type ReactNode } from 'react';
import { LinkPreview, extractUrls } from './LinkPreview';
import { useLinkPreview } from '@/hooks/useLinkPreview';

interface MessageTextProps {
  text: string;
  isOwnMessage: boolean;
}

// Component to render just the text content with clickable links
export function MessageText({ text, isOwnMessage }: MessageTextProps) {
  // Extract URLs from text
  const urls = useMemo(() => extractUrls(text), [text]);

  // Render text with clickable links
  const formattedText = useMemo(() => {
    if (urls.length === 0) return text;

    // Split text by URLs and render links
    let lastIndex = 0;
    const parts: ReactNode[] = [];
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      // Add text before the URL
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      // Add the URL as a link
      const url = match[0];
      parts.push(
        <a
          key={`${url}-${match.index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline ${
            isOwnMessage
              ? 'text-white hover:text-white/80'
              : 'text-[#005CFF] hover:text-[#0052E0]'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>
      );

      lastIndex = match.index + url.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  }, [text, urls, isOwnMessage]);

  return (
    <p
      className={`text-[15px] leading-[1.35] whitespace-pre-wrap break-all ${
        isOwnMessage ? 'text-white' : 'text-[#181818]'
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
