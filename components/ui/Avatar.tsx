'use client';

import { useMemo, useState } from 'react';
import { useUsername } from '@/hooks/useUsername';

interface AvatarProps {
  /** Display name for initials fallback */
  name?: string;
  /** Wallet address to lookup username/profile picture */
  address?: string | null;
  /** Direct image URL (overrides address lookup) */
  imageUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Color palette for letter avatars - mapped from Figma design tokens
const AVATAR_COLORS = [
  { bg: '#CCF3D9', text: '#00C230' }, // Green (Success)
  { bg: '#CCE5FF', text: '#005CFF' }, // Blue (Info)
  { bg: '#FFE5CC', text: '#FF8C00' }, // Orange
  { bg: '#FFCCCC', text: '#FF3333' }, // Red
  { bg: '#E5CCFF', text: '#9933FF' }, // Purple
  { bg: '#CCFFFF', text: '#00CCCC' }, // Cyan
  { bg: '#FFFFCC', text: '#CCCC00' }, // Yellow
  { bg: '#FFCCE5', text: '#FF3399' }, // Pink
] as const;

const SIZE_MAP = {
  sm: { container: 36, text: 14 },
  md: { container: 52, text: 22 },
  lg: { container: 72, text: 28 },
} as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getColorFromName(name: string): (typeof AVATAR_COLORS)[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function Avatar({ name, address, imageUrl, size = 'md', className = '' }: AvatarProps) {
  const { displayName, profilePicture } = useUsername(address);
  const [imgError, setImgError] = useState(false);

  // Use provided name, or fall back to username/address from hook
  const displayLabel = name ?? displayName ?? '';
  const initials = useMemo(() => getInitials(displayLabel), [displayLabel]);
  const colors = useMemo(() => getColorFromName(displayLabel), [displayLabel]);
  const dimensions = SIZE_MAP[size];

  // Priority: explicit imageUrl > profile picture from API
  const avatarUrl = imageUrl ?? (imgError ? null : profilePicture);

  if (avatarUrl) {
    return (
      <div
        className={`relative shrink-0 rounded-full overflow-hidden ${className}`}
        style={{ width: dimensions.container, height: dimensions.container }}
      >
        <img
          src={avatarUrl}
          alt={displayLabel}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 rounded-full flex items-center justify-center ${className}`}
      style={{
        width: dimensions.container,
        height: dimensions.container,
        backgroundColor: colors.bg,
      }}
    >
      <span
        className="font-light leading-none"
        style={{
          color: colors.text,
          fontSize: dimensions.text,
        }}
      >
        {initials}
      </span>
    </div>
  );
}
