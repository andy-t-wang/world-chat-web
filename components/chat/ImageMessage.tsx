'use client';

import { useState } from 'react';
import { Loader2, ImageIcon, RotateCcw, AlertTriangle } from 'lucide-react';
import { useImageAttachment } from '@/hooks/useImageAttachment';
import type { RemoteAttachmentContent } from '@/types/attachments';

interface ImageMessageProps {
  remoteAttachment: RemoteAttachmentContent;
  isOwnMessage: boolean;
}

/**
 * Image message component
 * Displays an image attachment with loading, error, and retry states
 * Matches Figma design: rounded corners, subtle border, no bubble background
 */
export function ImageMessage({ remoteAttachment, isOwnMessage }: ImageMessageProps) {
  const { status, blobUrl, error, isLoading, canRetry, retry } = useImageAttachment(remoteAttachment);
  const [imageError, setImageError] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Determine if image is vertical or horizontal for sizing
  const isVertical = imageDimensions ? imageDimensions.height > imageDimensions.width : true;

  // Container dimensions based on orientation (from Figma)
  const containerStyle = isVertical
    ? { width: 180, height: 232 }
    : { width: 250, height: 193 };

  // Loading state
  if (status === 'downloading' || isLoading) {
    return (
      <div
        className="bg-[#F3F4F5] border border-[rgba(0,0,0,0.1)] rounded-[16px] flex items-center justify-center"
        style={containerStyle}
      >
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#9BA3AE]" />
          <span className="text-[13px] text-[#717680]">
            Loading...
          </span>
        </div>
      </div>
    );
  }

  // Failed state
  if (status === 'failed' || imageError) {
    const isUntrusted = error === 'Untrusted CDN source';

    return (
      <div className="flex items-center gap-1.5">
        <div
          className="bg-[#F3F4F5] border border-[rgba(0,0,0,0.1)] rounded-[16px] flex items-center justify-center"
          style={containerStyle}
        >
          <div className="flex flex-col items-center gap-2">
            {isUntrusted ? (
              <AlertTriangle className="w-6 h-6 text-amber-500" />
            ) : (
              <ImageIcon className="w-6 h-6 text-[#9BA3AE]" />
            )}
            {canRetry && !imageError && (
              <button
                onClick={retry}
                className="flex items-center gap-1 text-[13px] text-[#005CFF] hover:underline"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>
        </div>
        {/* Error indicator icon */}
        <div className="w-6 h-6 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8.33" fill="#F2280D"/>
            <path d="M10 6v4.5M10 13.5v.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
    );
  }

  // Success state - show image
  if (blobUrl) {
    return (
      <div className="overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.1)]">
        <img
          src={blobUrl}
          alt={remoteAttachment.filename || 'Image'}
          className="block max-w-[250px] max-h-[300px] object-cover cursor-pointer"
          onLoad={(e) => {
            const img = e.target as HTMLImageElement;
            setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
          }}
          onError={() => setImageError(true)}
          onClick={() => {
            // Open in new tab for full view
            window.open(blobUrl, '_blank');
          }}
        />
      </div>
    );
  }

  return null;
}
