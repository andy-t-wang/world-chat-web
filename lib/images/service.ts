/**
 * Image Cache Service
 * Downloads, decrypts, and caches images from XMTP RemoteAttachments
 *
 * Uses a two-layer cache:
 * 1. In-memory LRU cache for blob URLs
 * 2. localStorage for metadata persistence (WorldChatImages table)
 */

import { LRUCache } from '@/lib/utils/lru';
import { IMAGE_CACHE } from '@/config/constants';
import type {
  WorldChatImage,
  RemoteAttachmentContent,
  ImageLoadResult,
  ImageStatus,
} from '@/types/attachments';

interface StorageData {
  version: number;
  entries: Record<string, WorldChatImage>;
}

/** Singleton cache for image metadata and blob URLs */
const imageCache = new LRUCache<string, WorldChatImage>(
  IMAGE_CACHE.MAX_CACHE_SIZE,
  (digest, entry) => {
    // Revoke blob URL when evicted to free memory
    if (entry.status === 'downloaded' && entry.fileLocation.startsWith('blob:')) {
      URL.revokeObjectURL(entry.fileLocation);
    }
  }
);

/** Pending downloads to deduplicate concurrent requests */
const pendingDownloads = new Map<string, Promise<ImageLoadResult>>();

/** Flag to track if we've loaded from localStorage */
let storageLoaded = false;

/**
 * Verify URL is from trusted CDN
 */
export function isTrustedCdnUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const trusted = new URL(IMAGE_CACHE.TRUSTED_CDN);
    return parsed.origin === trusted.origin;
  } catch {
    return false;
  }
}

/**
 * Load cached images from localStorage on first access
 */
function loadFromStorage(): void {
  if (storageLoaded || typeof window === 'undefined') return;
  storageLoaded = true;

  try {
    const stored = localStorage.getItem(IMAGE_CACHE.STORAGE_KEY);
    if (!stored) return;

    const data: StorageData = JSON.parse(stored);
    if (data.version !== IMAGE_CACHE.STORAGE_VERSION) {
      localStorage.removeItem(IMAGE_CACHE.STORAGE_KEY);
      return;
    }

    const now = Date.now();
    for (const [digest, entry] of Object.entries(data.entries)) {
      // Only load entries that haven't expired
      if (now - entry.cachedAt < IMAGE_CACHE.CACHE_TTL_MS) {
        // Note: blob URLs are not persisted - they need to be recreated
        // Mark as needing re-download if it was a blob URL
        if (entry.fileLocation.startsWith('blob:')) {
          entry.status = 'downloading';
          entry.fileLocation = '';
        }
        imageCache.set(digest, entry);
      }
    }
  } catch {
    localStorage.removeItem(IMAGE_CACHE.STORAGE_KEY);
  }
}

/**
 * Save current cache metadata to localStorage (debounced)
 */
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function saveToStorage(): void {
  if (typeof window === 'undefined') return;

  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const entries: Record<string, WorldChatImage> = {};
      const now = Date.now();

      imageCache.forEach((entry, digest) => {
        if (now - entry.cachedAt < IMAGE_CACHE.CACHE_TTL_MS) {
          entries[digest] = entry;
        }
      });

      const data: StorageData = {
        version: IMAGE_CACHE.STORAGE_VERSION,
        entries,
      };
      localStorage.setItem(IMAGE_CACHE.STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage errors
    }
  }, 1000);
}

/** Decrypted attachment shape from RemoteAttachmentCodec.load() */
interface LoadedAttachment {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

/**
 * Download and decrypt an image using RemoteAttachmentCodec
 */
async function downloadAndDecrypt(
  remoteAttachment: RemoteAttachmentContent,
  xmtpClient: unknown
): Promise<ImageLoadResult> {
  const { contentDigest, filename, url } = remoteAttachment;

  console.log('[ImageService] downloadAndDecrypt called');
  console.log('[ImageService] Original URL:', url?.slice(0, 100));
  console.log('[ImageService] Content digest:', contentDigest);

  try {
    // Import the codec dynamically
    const { RemoteAttachmentCodec } = await import('@xmtp/content-type-remote-attachment');

    // Rewrite URL to go through our proxy to avoid CORS issues
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
    console.log('[ImageService] Proxy URL:', proxyUrl.slice(0, 100));

    const proxiedAttachment = {
      ...remoteAttachment,
      url: proxyUrl,
    };

    console.log('[ImageService] Calling RemoteAttachmentCodec.load...');

    // Use the SDK's built-in load method which handles decryption
    // We use 'as any' because XMTP message content may not exactly match the SDK's expected type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attachment = await RemoteAttachmentCodec.load(
      proxiedAttachment as any,
      xmtpClient as any
    ) as LoadedAttachment;

    console.log('[ImageService] Load successful! Filename:', attachment.filename, 'Type:', attachment.mimeType, 'Size:', attachment.data?.length);

    // Create blob URL from decrypted data
    const blob = new Blob([attachment.data as BlobPart], { type: attachment.mimeType });
    const blobUrl = URL.createObjectURL(blob);
    console.log('[ImageService] Created blob URL:', blobUrl);

    // Cache the result
    const entry: WorldChatImage = {
      contentDigest,
      fileLocation: blobUrl,
      status: 'downloaded',
      isBackedUp: false,
      filename: attachment.filename || filename,
      mimeType: attachment.mimeType,
      contentLength: attachment.data.length,
      cachedAt: Date.now(),
    };

    imageCache.set(contentDigest, entry);
    saveToStorage();

    return {
      status: 'downloaded',
      blobUrl,
      filename: entry.filename,
      mimeType: entry.mimeType,
    };
  } catch (error) {
    console.error('[ImageService] Download/decrypt failed:', error);
    console.error('[ImageService] Error details:', error instanceof Error ? error.stack : String(error));

    // Cache the failure
    const failedEntry: WorldChatImage = {
      contentDigest,
      fileLocation: '',
      status: 'failed',
      isBackedUp: false,
      mimeType: '',
      cachedAt: Date.now(),
    };

    imageCache.set(contentDigest, failedEntry);
    saveToStorage();

    return {
      status: 'failed',
      blobUrl: null,
      error: error instanceof Error ? error.message : 'Download failed',
    };
  }
}

/**
 * Load an image from RemoteAttachment
 * Handles caching, CDN verification, download, and decryption
 */
export async function loadImage(
  remoteAttachment: RemoteAttachmentContent,
  xmtpClient: unknown
): Promise<ImageLoadResult> {
  loadFromStorage();

  const { contentDigest, url } = remoteAttachment;

  console.log('[ImageService] loadImage called for:', contentDigest?.slice(0, 20));
  console.log('[ImageService] URL:', url?.slice(0, 80));

  // Check cache first
  const cached = imageCache.get(contentDigest);
  if (cached && cached.status === 'downloaded' && cached.fileLocation) {
    console.log('[ImageService] Returning from cache (downloaded)');
    return {
      status: 'downloaded',
      blobUrl: cached.fileLocation,
      filename: cached.filename,
      mimeType: cached.mimeType,
    };
  }

  // Return cached failure state (allows retry via retryImage)
  if (cached && cached.status === 'failed') {
    console.log('[ImageService] Returning from cache (failed)');
    return {
      status: 'failed',
      blobUrl: null,
      error: 'Previous download failed',
    };
  }

  // Deduplicate concurrent downloads
  const pending = pendingDownloads.get(contentDigest);
  if (pending) {
    console.log('[ImageService] Returning pending download');
    return pending;
  }

  // Verify trusted CDN
  if (!isTrustedCdnUrl(url)) {
    console.log('[ImageService] Untrusted CDN URL:', url);
    const failedEntry: WorldChatImage = {
      contentDigest,
      fileLocation: url,
      status: 'failed',
      isBackedUp: false,
      mimeType: '',
      cachedAt: Date.now(),
    };
    imageCache.set(contentDigest, failedEntry);
    saveToStorage();
    return {
      status: 'failed',
      blobUrl: null,
      error: 'Untrusted CDN source',
    };
  }

  console.log('[ImageService] Starting download...');

  // Start download
  const downloadPromise = downloadAndDecrypt(remoteAttachment, xmtpClient);
  pendingDownloads.set(contentDigest, downloadPromise);

  try {
    return await downloadPromise;
  } finally {
    pendingDownloads.delete(contentDigest);
  }
}

/**
 * Retry a failed image download
 * Clears the failed status and attempts download again
 */
export async function retryImage(
  contentDigest: string,
  remoteAttachment: RemoteAttachmentContent,
  xmtpClient: unknown
): Promise<ImageLoadResult> {
  // Clear failed status from cache
  imageCache.delete(contentDigest);
  saveToStorage();

  // Attempt download again
  return loadImage(remoteAttachment, xmtpClient);
}

/**
 * Get cached image status without triggering download
 */
export function getCachedImage(contentDigest: string): WorldChatImage | null {
  loadFromStorage();
  return imageCache.get(contentDigest) ?? null;
}

/**
 * Check if an image download is untrusted (no retry allowed)
 */
export function isUntrustedError(error: string | undefined): boolean {
  return error === 'Untrusted CDN source';
}

/**
 * Clear all cached images
 */
export function clearImageCache(): void {
  // Revoke all blob URLs
  imageCache.forEach((entry) => {
    if (entry.fileLocation.startsWith('blob:')) {
      URL.revokeObjectURL(entry.fileLocation);
    }
  });
  imageCache.clear();
  pendingDownloads.clear();
  storageLoaded = false;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(IMAGE_CACHE.STORAGE_KEY);
  }
}
