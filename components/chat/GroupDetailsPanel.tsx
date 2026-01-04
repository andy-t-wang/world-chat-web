"use client";

import { useEffect, useCallback, useState } from "react";
import { X, Users, Image, Pencil, Bell, Pin, LogOut, ChevronRight, Loader2, ArrowLeft, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { useUsername } from "@/hooks/useUsername";

interface MemberPreview {
  inboxId: string;
  address: string;
}

interface GroupDetailsPanelProps {
  onClose: () => void;
  groupName: string;
  memberPreviews?: MemberPreview[];
  verifiedCount?: number;
  unverifiedCount?: number;
  avatarUrl?: string | null;
  conversationId: string;
  onLeaveGroup: () => Promise<void>;
  isLeavingGroup: boolean;
  ownInboxId?: string;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  variant?: "default" | "danger";
  isLoading?: boolean;
}

function MenuItem({ icon, label, value, onClick, variant = "default", isLoading }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors disabled:opacity-50 ${
        variant === "danger"
          ? "text-red-600 hover:bg-red-50"
          : "text-[#1D1D1F] hover:bg-[#F2F2F7]"
      }`}
    >
      <span className={`w-5 h-5 flex items-center justify-center ${
        variant === "danger" ? "text-red-600" : "text-[#86868B]"
      }`}>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      </span>
      <span className="flex-1 text-left text-[15px]">{label}</span>
      {value && (
        <span className="text-[15px] text-[#86868B] mr-1">{value}</span>
      )}
      {variant !== "danger" && !isLoading && (
        <ChevronRight className="w-4 h-4 text-[#C7C7CC]" />
      )}
    </button>
  );
}

// Member row component with username lookup
function MemberRow({
  address,
  isYou,
  isAdmin
}: {
  address: string;
  isYou: boolean;
  isAdmin?: boolean;
}) {
  const { displayName, profilePicture } = useUsername(address);
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const name = isYou ? "You" : (displayName || shortAddress);
  const username = displayName ? `@${displayName.toLowerCase().replace(/\s+/g, '')}` : shortAddress;
  const isVerified = Boolean(profilePicture);

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[#F2F2F7] transition-colors">
      <Avatar address={address} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-[15px] text-[#1D1D1F] truncate">{name}</span>
          {isVerified && <VerificationBadge size="xs" />}
        </div>
        {!isYou && (
          <span className="text-[13px] text-[#86868B] truncate block">{username}</span>
        )}
      </div>
      {isAdmin && (
        <span className="text-[13px] text-[#86868B]">Admin</span>
      )}
    </div>
  );
}

// Group members view
function GroupMembersView({
  memberPreviews,
  ownInboxId,
  onBack,
}: {
  memberPreviews: MemberPreview[];
  ownInboxId?: string;
  onBack: () => void;
}) {
  // Sort: You first, then others
  const sortedMembers = [...memberPreviews].sort((a, b) => {
    if (a.inboxId === ownInboxId) return -1;
    if (b.inboxId === ownInboxId) return 1;
    return 0;
  });

  const handleAddNew = useCallback(() => {
    alert("Coming soon!");
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 h-16 px-4 flex items-center gap-3 border-b border-[#E5E5EA]">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F2F7] transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#1D1D1F]" />
        </button>
        <span className="text-[17px] font-semibold text-[#1D1D1F]">Group members</span>
      </div>

      {/* Members list */}
      <div className="flex-1 overflow-y-auto scrollbar-auto-hide">
        {sortedMembers.map((member) => (
          <MemberRow
            key={member.inboxId}
            address={member.address}
            isYou={member.inboxId === ownInboxId}
            isAdmin={member.inboxId === ownInboxId} // For now, assume first member (you) is admin
          />
        ))}
      </div>

      {/* Add new button at bottom */}
      <div className="shrink-0 p-4 border-t border-[#E5E5EA]">
        <button
          onClick={handleAddNew}
          className="w-full h-12 flex items-center justify-center gap-2 rounded-full border border-[#E5E5EA] text-[15px] font-medium text-[#1D1D1F] hover:bg-[#F2F2F7] transition-colors"
        >
          <UserPlus className="w-5 h-5" />
          Add new
        </button>
      </div>
    </div>
  );
}

export function GroupDetailsPanel({
  onClose,
  groupName,
  memberPreviews = [],
  verifiedCount = 0,
  unverifiedCount = 0,
  avatarUrl,
  conversationId,
  onLeaveGroup,
  isLeavingGroup,
  ownInboxId,
}: GroupDetailsPanelProps) {
  const [view, setView] = useState<"details" | "members">("details");

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view === "members") {
          setView("details");
        } else {
          onClose();
        }
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, view]);

  const handleComingSoon = useCallback(() => {
    alert("Coming soon!");
  }, []);

  // Build member count string
  const memberCountText = (() => {
    if (verifiedCount > 0 && unverifiedCount > 0) {
      return `${verifiedCount} ${verifiedCount === 1 ? "human" : "humans"}, ${unverifiedCount} not verified`;
    }
    if (verifiedCount > 0) {
      return `${verifiedCount} ${verifiedCount === 1 ? "human" : "humans"}`;
    }
    if (unverifiedCount > 0) {
      return `${unverifiedCount} not verified`;
    }
    const total = memberPreviews.length;
    return `${total} ${total === 1 ? "member" : "members"}`;
  })();

  // Members view
  if (view === "members") {
    return (
      <div className="w-[320px] shrink-0 h-full bg-white border-l border-[#E5E5EA] flex flex-col">
        <GroupMembersView
          memberPreviews={memberPreviews}
          ownInboxId={ownInboxId}
          onBack={() => setView("details")}
        />
      </div>
    );
  }

  // Details view
  return (
    <div className="w-[320px] shrink-0 h-full bg-white border-l border-[#E5E5EA] flex flex-col">
      {/* Header */}
      <div className="shrink-0 h-16 px-4 flex items-center justify-between border-b border-[#E5E5EA]">
        <span className="text-[17px] font-semibold text-[#1D1D1F]">Group Info</span>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F2F7] transition-colors"
        >
          <X className="w-5 h-5 text-[#86868B]" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-auto-hide">
        {/* Group Avatar & Name Section */}
        <div className="flex flex-col items-center pt-8 pb-6 px-4">
          {/* Large group avatar */}
          <Avatar
            isGroup
            groupName={groupName}
            imageUrl={avatarUrl}
            memberPreviews={memberPreviews}
            size="lg"
          />

          {/* Group name */}
          <h2 className="mt-4 text-[22px] font-semibold text-[#1D1D1F] text-center">
            {groupName || "Group Chat"}
          </h2>

          {/* Member count with verification badge */}
          <div className="flex items-center gap-1.5 mt-1">
            {verifiedCount > 0 && <VerificationBadge size="sm" />}
            <span className="text-[15px] text-[#86868B]">{memberCountText}</span>
          </div>
        </div>

        {/* Menu Items */}
        <div>
          <MenuItem
            icon={<Users className="w-5 h-5" />}
            label="Group members"
            onClick={() => setView("members")}
          />
          <MenuItem
            icon={<Image className="w-5 h-5" />}
            label="Media, Links and Mini Apps"
            onClick={handleComingSoon}
          />
          <MenuItem
            icon={<Pencil className="w-5 h-5" />}
            label="Group name"
            onClick={handleComingSoon}
          />
          <MenuItem
            icon={<Bell className="w-5 h-5" />}
            label="Notifications"
            value="On"
            onClick={handleComingSoon}
          />
          <MenuItem
            icon={<Pin className="w-5 h-5" />}
            label="Pin"
            onClick={handleComingSoon}
          />
        </div>
      </div>

      {/* Leave Group - fixed at bottom */}
      <div className="shrink-0 border-t border-[#E5E5EA]">
        <MenuItem
          icon={<LogOut className="w-5 h-5" />}
          label="Leave chat"
          onClick={onLeaveGroup}
          variant="danger"
          isLoading={isLeavingGroup}
        />
      </div>
    </div>
  );
}
