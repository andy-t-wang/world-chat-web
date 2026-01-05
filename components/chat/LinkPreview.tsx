'use client';

import { useState } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';

export interface LinkMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  domain: string;
  // Twitter-specific fields
  type?: 'twitter' | 'generic';
  author?: string;
  authorUsername?: string;
}

interface LinkPreviewProps {
  metadata: LinkMetadata | null;
  isLoading: boolean;
  isOwnMessage: boolean;
}

// X/Twitter logo SVG
function XLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function LinkPreview({ metadata, isLoading, isOwnMessage }: LinkPreviewProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Loading state
  if (isLoading || !metadata) {
    const domain = metadata?.domain ?? 'Loading...';
    return (
      <div className="bg-[#F2F2F7] rounded-2xl overflow-hidden w-[340px]">
        <div className="flex flex-col gap-2 items-center justify-center px-8 py-10">
          <Loader2 className="w-5 h-5 text-[#8E8E93] animate-spin" />
          <span className="text-[11px] text-[#8E8E93] truncate max-w-full">
            {domain}
          </span>
        </div>
      </div>
    );
  }

  const { url, title, description, image, domain, type, author, authorUsername } = metadata;
  const hasImage = image && !imageError;
  const isTwitter = type === 'twitter';

  const handleClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Twitter/X card design
  if (isTwitter) {
    return (
      <div
        onClick={handleClick}
        className="cursor-pointer overflow-hidden rounded-2xl bg-[#F7F9FA] border border-[#E1E8ED] w-[340px] hover:bg-[#EDF0F3] transition-colors group"
      >
        {/* Header with X logo and author */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
            <XLogo className="w-4 h-4 text-black" />
          </div>
          {author ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[14px] font-semibold text-[#0F1419] truncate">
                {author}
              </span>
              {authorUsername && (
                <span className="text-[14px] text-[#536471] truncate">
                  @{authorUsername}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[14px] font-medium text-[#536471]">
              X (formerly Twitter)
            </span>
          )}
        </div>

        {/* Tweet text */}
        {title && (
          <div className="px-4 pb-3">
            <p className="text-[15px] text-[#0F1419] leading-[1.4] line-clamp-4 whitespace-pre-wrap">
              {title}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 pb-3 flex items-center gap-1.5">
          <span className="text-[13px] text-[#1D9BF0]">
            View on X
          </span>
          <ExternalLink className="w-3.5 h-3.5 text-[#1D9BF0] opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    );
  }

  // Generic link preview - iMessage style: big image, title, domain
  return (
    <div
      onClick={handleClick}
      className="cursor-pointer overflow-hidden rounded-2xl w-[340px] bg-[#F2F2F7] hover:bg-[#E5E5EA] transition-colors"
    >
      {/* Large image */}
      {hasImage && (
        <div className="relative h-[180px] bg-[#E5E5EA]">
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-[#8E8E93] animate-spin" />
            </div>
          )}
          <img
            src={image}
            alt={title || domain}
            className={`w-full h-full object-cover transition-opacity ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        </div>
      )}

      {/* Content area */}
      <div className="px-3 py-2.5">
        {/* Domain - small gray text at top if no image */}
        {!hasImage && (
          <p className="text-[11px] text-[#8E8E93] mb-1 truncate">
            {domain}
          </p>
        )}

        {/* Title */}
        {title && (
          <p className="text-[13px] font-semibold text-[#1C1C1E] leading-[1.3] line-clamp-2">
            {title}
          </p>
        )}

        {/* Description - show when no image for richer preview */}
        {!hasImage && description && (
          <p className="text-[12px] text-[#8E8E93] leading-[1.4] line-clamp-3 mt-1">
            {description}
          </p>
        )}

        {/* Domain - small gray text at bottom if has image */}
        {hasImage && (
          <p className="text-[11px] text-[#8E8E93] mt-0.5 truncate">
            {domain}
          </p>
        )}
      </div>
    </div>
  );
}

// Helper to extract URLs from text
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex);
  return matches ? [...new Set(matches)] : [];
}

// Check if text is just a single URL (with optional whitespace)
export function isJustUrl(text: string): boolean {
  const trimmed = text.trim();
  const urlRegex = /^https?:\/\/[^\s<>"{}|\\^`[\]]+$/i;
  return urlRegex.test(trimmed);
}

// Helper to get domain from URL
export function getDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
