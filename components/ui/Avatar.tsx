'use client';

import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useUsername } from '@/hooks/useUsername';

interface MemberPreview {
  inboxId: string;
  address: string;
}

interface AvatarProps {
  /** Display name for initials fallback */
  name?: string;
  /** Wallet address to lookup username/profile picture */
  address?: string | null;
  /** Direct image URL (overrides address lookup) */
  imageUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Whether this is a group avatar */
  isGroup?: boolean;
  /** Group name for fallback initials */
  groupName?: string;
  /** Member previews for group stacked avatars */
  memberPreviews?: MemberPreview[];
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

// Mini avatar for group stacked display
function MiniAvatar({ address, size }: { address: string; size: number }) {
  const { displayName, profilePicture } = useUsername(address);
  const [imgError, setImgError] = useState(false);
  const displayLabel = displayName ?? address.slice(0, 6);
  const initials = getInitials(displayLabel);
  const colors = getColorFromName(displayLabel);

  if (profilePicture && !imgError) {
    return (
      <div
        className="rounded-full overflow-hidden border-2 border-white"
        style={{ width: size, height: size }}
      >
        <img
          src={profilePicture}
          alt={displayLabel}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center border-2 border-white"
      style={{
        width: size,
        height: size,
        backgroundColor: colors.bg,
      }}
    >
      <span
        className="font-light leading-none"
        style={{ color: colors.text, fontSize: size * 0.4 }}
      >
        {initials}
      </span>
    </div>
  );
}

// Group avatar with stacked member avatars or icon fallback
function GroupAvatar({
  groupName,
  groupImageUrl,
  memberPreviews,
  size,
  className,
}: {
  groupName?: string;
  groupImageUrl?: string;
  memberPreviews?: MemberPreview[];
  size: 'sm' | 'md' | 'lg';
  className: string;
}) {
  const [imgError, setImgError] = useState(false);
  const dimensions = SIZE_MAP[size];
  const miniSize = Math.round(dimensions.container * 0.55);

  // If group has an image URL, use it
  if (groupImageUrl && !imgError) {
    return (
      <div
        className={`relative shrink-0 rounded-full overflow-hidden ${className}`}
        style={{ width: dimensions.container, height: dimensions.container }}
      >
        <img
          src={groupImageUrl}
          alt={groupName ?? 'Group'}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // If we have member previews, show stacked avatars (2x2 grid for 4, otherwise stacked)
  if (memberPreviews && memberPreviews.length >= 2) {
    const displayMembers = memberPreviews.slice(0, 4);

    if (displayMembers.length === 4) {
      // 2x2 grid
      const gridSize = Math.round(dimensions.container * 0.48);
      return (
        <div
          className={`relative shrink-0 rounded-full overflow-hidden bg-gray-200 ${className}`}
          style={{ width: dimensions.container, height: dimensions.container }}
        >
          <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5 p-0.5">
            {displayMembers.map((member) => (
              <MiniAvatar key={member.inboxId} address={member.address} size={gridSize} />
            ))}
          </div>
        </div>
      );
    }

    // 2-3 members: stacked overlapping
    return (
      <div
        className={`relative shrink-0 ${className}`}
        style={{ width: dimensions.container, height: dimensions.container }}
      >
        {displayMembers.slice(0, 2).map((member, index) => (
          <div
            key={member.inboxId}
            className="absolute"
            style={{
              left: index * (miniSize * 0.5),
              top: index * (miniSize * 0.3),
              zIndex: displayMembers.length - index,
            }}
          >
            <MiniAvatar address={member.address} size={miniSize} />
          </div>
        ))}
      </div>
    );
  }

  // Fallback: group icon or initials
  const displayLabel = groupName ?? 'Group';
  const initials = getInitials(displayLabel);
  const colors = getColorFromName(displayLabel);

  return (
    <div
      className={`relative shrink-0 rounded-full flex items-center justify-center ${className}`}
      style={{
        width: dimensions.container,
        height: dimensions.container,
        backgroundColor: colors.bg,
      }}
    >
      {groupName ? (
        <span
          className="font-light leading-none"
          style={{ color: colors.text, fontSize: dimensions.text }}
        >
          {initials}
        </span>
      ) : (
        <Users
          className="opacity-80"
          style={{ color: colors.text }}
          size={dimensions.text}
        />
      )}
    </div>
  );
}

export function Avatar({
  name,
  address,
  imageUrl,
  size = 'md',
  className = '',
  isGroup = false,
  groupName,
  memberPreviews,
}: AvatarProps) {
  // Handle group avatars
  if (isGroup) {
    return (
      <GroupAvatar
        groupName={groupName}
        groupImageUrl={imageUrl ?? undefined}
        memberPreviews={memberPreviews}
        size={size}
        className={className}
      />
    );
  }

  // Standard single-person avatar
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
