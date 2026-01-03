/**
 * Attachment Types
 * Types for image attachments received via XMTP RemoteAttachment
 */

/** Status of an image download */
export type ImageStatus = 'downloading' | 'downloaded' | 'failed';

/** Cached image entry stored in localStorage (WorldChatImages table) */
export interface WorldChatImage {
  /** SHA256 content digest from RemoteAttachment (primary key) */
  contentDigest: string;
  /** Blob URL or empty if failed */
  fileLocation: string;
  /** Download/cache status */
  status: ImageStatus;
  /** Placeholder for future backup feature */
  isBackedUp: boolean;
  /** Original filename from attachment */
  filename?: string;
  /** MIME type (e.g., 'image/png') */
  mimeType: string;
  /** File size in bytes */
  contentLength?: number;
  /** Timestamp when cached */
  cachedAt: number;
}

/** RemoteAttachment content structure from XMTP */
export interface RemoteAttachmentContent {
  /** CDN URL to fetch encrypted content */
  url: string;
  /** Content hash for verification */
  contentDigest: string;
  /** Salt for decryption */
  salt: Uint8Array;
  /** Nonce for decryption */
  nonce: Uint8Array;
  /** Secret key for decryption */
  secret: Uint8Array;
  /** Encryption scheme (e.g., 'aes-256-gcm') */
  scheme: string;
  /** Optional file size in bytes */
  contentLength?: number;
  /** Optional original filename */
  filename?: string;
}

/** Decrypted attachment result from RemoteAttachmentCodec.load() */
export interface DecryptedAttachment {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

/** Image load result for UI */
export interface ImageLoadResult {
  status: ImageStatus;
  blobUrl: string | null;
  error?: string;
  filename?: string;
  mimeType?: string;
}
