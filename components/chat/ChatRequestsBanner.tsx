"use client";

import { Mail, ChevronRight } from "lucide-react";

interface ChatRequestsBannerProps {
  count: number;
  onClick?: () => void;
}

export function ChatRequestsBanner({
  count,
  onClick,
}: ChatRequestsBannerProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
    >
      {/* Icon */}
      <div className="w-[48px] h-[48px] rounded-full bg-[#F5F5F5] flex items-center justify-center shrink-0">
        <Mail className="w-6 h-6 text-[#181818]" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5 items-start">
        <span className="text-[16px] font-medium text-[#181818]">
          Chat requests
        </span>
        <span className="text-[14px] text-[#717680] leading-[1.3]">
          {count} new message {count === 1 ? "request" : "requests"}
        </span>
      </div>

      {/* Arrow */}
      <ChevronRight className="w-5 h-5 text-[#9BA3AE] shrink-0" />
    </button>
  );
}
