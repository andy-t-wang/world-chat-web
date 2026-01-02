'use client';

import { useState } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';

export interface LinkMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  domain: string;
}

interface LinkPreviewProps {
  metadata: LinkMetadata | null;
  isLoading: boolean;
  isOwnMessage: boolean;
}

export function LinkPreview({ metadata, isLoading, isOwnMessage }: LinkPreviewProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Loading state
  if (isLoading || !metadata) {
    const domain = metadata?.domain ?? 'Loading...';
    return (
      <div className="mt-2">
        <div className="bg-[#F9FAFB] border border-[#F3F4F5] rounded-[16px] overflow-hidden w-[176px]">
          <div className="flex flex-col gap-3 items-center justify-center px-[30px] py-5 h-[112px]">
            <Loader2 className="w-6 h-6 text-[#9BA3AE] animate-spin" />
            <span className="text-[15px] text-[#9BA3AE] leading-[1.3] truncate max-w-full">
              {domain}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const { url, title, description, image, domain } = metadata;
  const hasImage = image && !imageError;

  // Determine layout based on image aspect ratio or content
  // For now, use horizontal layout if we have an image, otherwise compact
  const useHorizontalLayout = hasImage;

  const handleClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Horizontal layout with image on top (like world.org example)
  if (useHorizontalLayout) {
    return (
      <div className="mt-2">
        <div className="flex gap-2 items-center">
          {/* Share button - only show for own messages */}
          {isOwnMessage && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(url);
              }}
              className="w-8 h-8 shrink-0 flex items-center justify-center bg-[#EBECEF] rounded-full hover:bg-[#D6D9DD] transition-colors"
              title="Copy link"
            >
              <ExternalLink className="w-[18px] h-[18px] text-[#181818]" />
            </button>
          )}

          <div
            onClick={handleClick}
            className="cursor-pointer overflow-hidden rounded-[16px] w-[271px] hover:opacity-95 transition-opacity"
          >
            {/* Image */}
            {hasImage && (
              <div className="relative h-[130px] bg-[#F3F4F5]">
                {!imageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-[#9BA3AE] animate-spin" />
                  </div>
                )}
                <img
                  src={image}
                  alt={title || domain}
                  className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              </div>
            )}

            {/* Content */}
            <div className="bg-[#F3F4F5] p-[14px]">
              {title && (
                <p className="text-[15px] text-[#181818] leading-[1.2] font-medium truncate">
                  {title}
                </p>
              )}
              <p className="text-[13px] text-[#717680] leading-[1.3] truncate mt-0.5">
                {domain}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Compact layout without image
  return (
    <div className="mt-2">
      <div className="flex gap-2 items-center">
        {isOwnMessage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(url);
            }}
            className="w-8 h-8 shrink-0 flex items-center justify-center bg-[#EBECEF] rounded-full hover:bg-[#D6D9DD] transition-colors"
            title="Copy link"
          >
            <ExternalLink className="w-[18px] h-[18px] text-[#181818]" />
          </button>
        )}

        <div
          onClick={handleClick}
          className="cursor-pointer overflow-hidden rounded-[16px] bg-[#F3F4F5] p-[14px] min-w-[180px] max-w-[271px] hover:bg-[#EBECEF] transition-colors"
        >
          {title && (
            <p className="text-[15px] text-[#181818] leading-[1.2] font-medium truncate">
              {title}
            </p>
          )}
          {description && !title && (
            <p className="text-[15px] text-[#181818] leading-[1.2] truncate">
              {description}
            </p>
          )}
          <p className="text-[13px] text-[#717680] leading-[1.3] truncate mt-0.5">
            {domain}
          </p>
        </div>
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

// Helper to get domain from URL
export function getDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
