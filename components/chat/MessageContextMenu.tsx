'use client';

import { useEffect, useRef } from 'react';
import { Reply, Copy } from 'lucide-react';

interface MessageContextMenuProps {
  position: { x: number; y: number };
  onReply: () => void;
  onCopy: () => void;
  onClose: () => void;
}

export function MessageContextMenu({
  position,
  onReply,
  onCopy,
  onClose,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 160),
    y: Math.min(position.y, window.innerHeight - 100),
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[140px]"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      <button
        onClick={() => {
          onReply();
          onClose();
        }}
        className="w-full px-4 py-2.5 text-left text-[15px] text-[#181818] hover:bg-gray-50 transition-colors flex items-center gap-3"
      >
        <Reply className="w-4 h-4 text-[#717680]" />
        Reply
      </button>
      <button
        onClick={() => {
          onCopy();
          onClose();
        }}
        className="w-full px-4 py-2.5 text-left text-[15px] text-[#181818] hover:bg-gray-50 transition-colors flex items-center gap-3"
      >
        <Copy className="w-4 h-4 text-[#717680]" />
        Copy
      </button>
    </div>
  );
}
