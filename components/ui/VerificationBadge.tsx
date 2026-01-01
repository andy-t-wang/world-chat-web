'use client';

interface VerificationBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE_MAP = {
  sm: 10,
  md: 14,
} as const;

export function VerificationBadge({ size = 'sm', className = '' }: VerificationBadgeProps) {
  const dimension = SIZE_MAP[size];

  return (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
    >
      <circle cx="7" cy="7" r="7" fill="#005CFF" />
      <path
        d="M4 7L6 9L10 5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
