'use client';

import { useMemo } from 'react';

interface AvatarProps {
  name: string;
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

export function Avatar({ name, imageUrl, size = 'md', className = '' }: AvatarProps) {
  const initials = useMemo(() => getInitials(name), [name]);
  const colors = useMemo(() => getColorFromName(name), [name]);
  const dimensions = SIZE_MAP[size];

  if (imageUrl) {
    return (
      <div
        className={`relative shrink-0 rounded-full overflow-hidden ${className}`}
        style={{ width: dimensions.container, height: dimensions.container }}
      >
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
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
