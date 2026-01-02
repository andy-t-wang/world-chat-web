'use client';

import { Loader2, ArrowUpRight, XCircle } from 'lucide-react';
import type {
  TransactionReference,
  TransactionStatus,
  PaymentType,
} from '@/lib/xmtp/TransactionReferenceCodec';
import { formatTokenAmount } from '@/lib/xmtp/TransactionReferenceCodec';
import { useTransactionDetails } from '@/hooks/useTransactionDetails';

// US Flag SVG component (World Chain uses USD as primary currency display)
function USFlag({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <clipPath id="flagClip">
        <circle cx="10" cy="10" r="10" />
      </clipPath>
      <g clipPath="url(#flagClip)">
        <rect width="20" height="20" fill="#B22234" />
        <rect y="1.54" width="20" height="1.54" fill="white" />
        <rect y="4.62" width="20" height="1.54" fill="white" />
        <rect y="7.7" width="20" height="1.54" fill="white" />
        <rect y="10.78" width="20" height="1.54" fill="white" />
        <rect y="13.86" width="20" height="1.54" fill="white" />
        <rect y="16.94" width="20" height="1.54" fill="white" />
        <rect width="8" height="10.78" fill="#3C3B6E" />
      </g>
    </svg>
  );
}

interface PaymentMessageProps {
  txRef: TransactionReference;
  isOwnMessage: boolean;
  onViewTransaction?: () => void;
}

/**
 * Payment message bubble component
 * Displays transaction details with status, amount, and optional description
 */
export function PaymentMessage({
  txRef,
  isOwnMessage,
  onViewTransaction,
}: PaymentMessageProps) {
  const { details, isLoading } = useTransactionDetails(txRef);

  // Use fetched details or fall back to reference data
  const status: TransactionStatus = details?.status || 'pending';
  const amount = details?.amount || txRef.amount;
  const token = details?.token || txRef.token;
  const description = details?.description || txRef.description;
  const type = txRef.type;

  // Format amount for display (token amount with symbol)
  const formattedAmount = `${formatTokenAmount(amount, token.decimals)} ${token.symbol}`;

  // Determine status display text
  const getStatusText = (): string => {
    if (status === 'pending') return 'Pending';
    if (status === 'failed') return 'Failed';
    if (type === 'request') return 'Request';
    return isOwnMessage ? 'Sent' : 'Received';
  };

  // Explorer URL for World Chain - use actual tx hash if available (for ERC-4337 userOps)
  const txHashForExplorer = details?.actualTxHash || txRef.txHash;
  const explorerUrl = `https://worldchain-mainnet.explorer.alchemy.com/tx/${txHashForExplorer}`;

  if (isOwnMessage) {
    return (
      <SenderPaymentBubble
        status={status}
        amount={formattedAmount}
        description={description}
        statusText={getStatusText()}
        isLoading={isLoading}
        explorerUrl={explorerUrl}
        onViewTransaction={onViewTransaction}
      />
    );
  }

  return (
    <RecipientPaymentBubble
      status={status}
      amount={formattedAmount}
      description={description}
      statusText={getStatusText()}
      type={type}
      isLoading={isLoading}
      explorerUrl={explorerUrl}
      onViewTransaction={onViewTransaction}
    />
  );
}

interface SenderPaymentBubbleProps {
  status: TransactionStatus;
  amount: string;
  description?: string;
  statusText: string;
  isLoading: boolean;
  explorerUrl: string;
  onViewTransaction?: () => void;
}

/**
 * Sender payment bubble (blue background)
 */
function SenderPaymentBubble({
  status,
  amount,
  description,
  statusText,
  isLoading,
  explorerUrl,
}: SenderPaymentBubbleProps) {
  const isFailed = status === 'failed';
  const isPending = status === 'pending';

  return (
    <div className="bg-[#005CFF] rounded-[16px] p-3 w-[208px]">
      {/* Status badge */}
      <div className="inline-flex items-center gap-1 bg-white/20 rounded-full pl-0.5 pr-2 py-0.5 mb-6">
        {isPending || isLoading ? (
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        ) : isFailed ? (
          <XCircle className="w-5 h-5 text-white" />
        ) : (
          <USFlag className="w-5 h-5" />
        )}
        <span className="text-[13px] text-white leading-[1.2]">{statusText}</span>
      </div>

      {/* Amount and description */}
      <div className="flex flex-col gap-1">
        <p
          className={`text-[30px] font-medium text-white leading-[1.2] tracking-[-1px] ${
            isFailed ? 'line-through opacity-50' : ''
          }`}
        >
          {amount}
        </p>
        {description && (
          <p className="text-[15px] text-white leading-[1.3]">{description}</p>
        )}
        {status === 'confirmed' && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-white hover:opacity-80 transition-opacity mt-1"
          >
            <ArrowUpRight className="w-[18px] h-[18px]" />
            <span className="text-[15px] leading-[1.3]">View on explorer</span>
          </a>
        )}
      </div>
    </div>
  );
}

interface RecipientPaymentBubbleProps {
  status: TransactionStatus;
  amount: string;
  description?: string;
  statusText: string;
  type: PaymentType;
  isLoading: boolean;
  explorerUrl: string;
  onViewTransaction?: () => void;
}

/**
 * Recipient payment bubble (gray background)
 */
function RecipientPaymentBubble({
  status,
  amount,
  description,
  statusText,
  type,
  isLoading,
  explorerUrl,
}: RecipientPaymentBubbleProps) {
  const isPending = status === 'pending';
  const isRequest = type === 'request';

  return (
    <div className="bg-white rounded-[16px] p-3 w-[208px]">
      {/* Status badge */}
      <div className="inline-flex items-center gap-1 bg-white border border-[#F3F4F5] rounded-full pl-0.5 pr-2 py-0.5 mb-6">
        {isPending || isLoading ? (
          <Loader2 className="w-5 h-5 text-[#9BA3AE] animate-spin" />
        ) : (
          <USFlag className="w-5 h-5" />
        )}
        <span className="text-[13px] text-[#181818] leading-[1.2]">{statusText}</span>
      </div>

      {/* Amount and description */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[30px] font-medium text-[#181818] leading-[1.2] tracking-[-1px]">
            {amount}
          </p>
          {description && (
            <p className="text-[15px] text-[#181818] leading-[1.3]">{description}</p>
          )}
        </div>

        {/* Action button for requests */}
        {isRequest && status !== 'confirmed' && (
          <button className="w-full h-8 bg-[#181818] text-white text-[13px] font-medium rounded-full hover:bg-[#333] transition-colors">
            Pay
          </button>
        )}

        {/* View on explorer link */}
        {status === 'confirmed' && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[#181818] hover:opacity-70 transition-opacity"
          >
            <ArrowUpRight className="w-[18px] h-[18px]" />
            <span className="text-[15px] leading-[1.3]">View on explorer</span>
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Compact payment preview for conversation list
 */
export function PaymentPreview({
  txRef,
  isOwnMessage,
}: {
  txRef: TransactionReference;
  isOwnMessage: boolean;
}) {
  const formattedAmount = `${formatTokenAmount(txRef.amount, txRef.token.decimals)} ${txRef.token.symbol}`;
  const prefix = isOwnMessage
    ? txRef.type === 'request'
      ? 'Requested'
      : 'Sent'
    : txRef.type === 'request'
      ? 'Payment request'
      : 'Received';

  return (
    <span className="text-[14px] text-[#717680]">
      {prefix} {formattedAmount}
    </span>
  );
}
