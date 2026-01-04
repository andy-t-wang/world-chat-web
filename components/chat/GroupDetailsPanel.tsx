"use client";

import { useEffect, useCallback, useState } from "react";
import { X, Users, Image, Pencil, Bell, Pin, LogOut, ChevronRight, Loader2, ArrowLeft, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { useUsername } from "@/hooks/useUsername";
import { AddMemberModal } from "./AddMemberModal";

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
  onMemberAdded?: (address: string, displayName: string | null) => void;
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
  isAdmin,
  isPending
}: {
  address: string;
  isYou: boolean;
  isAdmin?: boolean;
  isPending?: boolean;
}) {
  const { displayName, profilePicture } = useUsername(address);
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const name = isYou ? "You" : (displayName || shortAddress);
  const username = displayName ? `@${displayName.toLowerCase().replace(/\s+/g, '')}` : shortAddress;
  const isVerified = Boolean(profilePicture);

  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-[#F2F2F7] transition-colors ${isPending ? 'opacity-60' : ''}`}>
      <Avatar address={address} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-[15px] text-[#1D1D1F] truncate">{name}</span>
          {isVerified && <VerificationBadge size="xs" />}
          {isPending && <Loader2 className="w-3 h-3 animate-spin text-[#86868B]" />}
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
  optimisticMembers,
  ownInboxId,
  onBack,
  onAddNew,
}: {
  memberPreviews: MemberPreview[];
  optimisticMembers: MemberPreview[];
  ownInboxId?: string;
  onBack: () => void;
  onAddNew: () => void;
}) {
  // Get set of real member addresses for deduplication
  const realMemberAddresses = new Set(memberPreviews.map(m => m.address.toLowerCase()));

  // Filter optimistic members to exclude those already in real list
  const pendingOptimistic = optimisticMembers.filter(
    m => !realMemberAddresses.has(m.address.toLowerCase())
  );

  // Combine confirmed and pending optimistic members
  const allMembers = [...memberPreviews, ...pendingOptimistic];

  // Sort: You first, then others
  const sortedMembers = [...allMembers].sort((a, b) => {
    if (a.inboxId === ownInboxId) return -1;
    if (b.inboxId === ownInboxId) return 1;
    return 0;
  });

  // Track which members are still pending (optimistic and not yet in real list)
  const optimisticAddresses = new Set(pendingOptimistic.map(m => m.address.toLowerCase()));

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
            key={member.inboxId || member.address}
            address={member.address}
            isYou={member.inboxId === ownInboxId}
            isAdmin={member.inboxId === ownInboxId}
            isPending={optimisticAddresses.has(member.address.toLowerCase())}
          />
        ))}
      </div>

      {/* Add new button at bottom */}
      <div className="shrink-0 p-4 border-t border-[#E5E5EA]">
        <button
          onClick={onAddNew}
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
  onMemberAdded,
}: GroupDetailsPanelProps) {
  const [view, setView] = useState<"details" | "members">("details");
  const [showAddModal, setShowAddModal] = useState(false);
  const [optimisticMembers, setOptimisticMembers] = useState<MemberPreview[]>([]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAddModal) {
          setShowAddModal(false);
        } else if (view === "members") {
          setView("details");
        } else {
          onClose();
        }
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, view, showAddModal]);

  const handleComingSoon = useCallback(() => {
    alert("Coming soon!");
  }, []);

  // Handle member added - optimistic update
  const handleMemberAdded = useCallback((address: string, displayName: string | null) => {
    // Add to optimistic list immediately
    const optimisticMember: MemberPreview = {
      inboxId: `optimistic-${address}`,
      address: address,
    };
    setOptimisticMembers(prev => [...prev, optimisticMember]);

    // Notify parent (which will send system message and refresh metadata)
    onMemberAdded?.(address, displayName);

    // Remove from optimistic list after a delay (real data should have arrived)
    setTimeout(() => {
      setOptimisticMembers(prev => prev.filter(m => m.address.toLowerCase() !== address.toLowerCase()));
    }, 3000);
  }, [onMemberAdded]);

  // Build member count string
  const totalMembers = memberPreviews.length + optimisticMembers.length;
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
    return `${totalMembers} ${totalMembers === 1 ? "member" : "members"}`;
  })();

  // Get existing member addresses for the modal
  const existingMemberAddresses = memberPreviews.map(m => m.address);

  // Members view
  if (view === "members") {
    return (
      <div className="w-[320px] shrink-0 h-full bg-white border-l border-[#E5E5EA] flex flex-col">
        <GroupMembersView
          memberPreviews={memberPreviews}
          optimisticMembers={optimisticMembers}
          ownInboxId={ownInboxId}
          onBack={() => setView("details")}
          onAddNew={() => setShowAddModal(true)}
        />

        {/* Add Member Modal */}
        <AddMemberModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          conversationId={conversationId}
          existingMemberAddresses={existingMemberAddresses}
          onMemberAdded={handleMemberAdded}
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
