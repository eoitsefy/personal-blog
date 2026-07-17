const DEFAULT_MEDIA_STORAGE_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_MEDIA_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024 * 1024;

export function getMediaStorageQuotaBytes() {
  const configured = Number(process.env.MAX_MEDIA_STORAGE_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, MAX_MEDIA_STORAGE_QUOTA_BYTES)
    : DEFAULT_MEDIA_STORAGE_QUOTA_BYTES;
}

export function mediaStorageStatus(usedBytes: number, quotaBytes = getMediaStorageQuotaBytes()) {
  const safeUsed = Number.isSafeInteger(usedBytes) && usedBytes > 0 ? usedBytes : 0;
  const safeQuota = Number.isSafeInteger(quotaBytes) && quotaBytes > 0
    ? quotaBytes
    : DEFAULT_MEDIA_STORAGE_QUOTA_BYTES;
  return {
    usedBytes: safeUsed,
    quotaBytes: safeQuota,
    remainingBytes: Math.max(0, safeQuota - safeUsed),
    usagePercent: Math.min(100, (safeUsed / safeQuota) * 100),
  };
}

export function wouldExceedMediaStorageQuota(usedBytes: number, incomingBytes: number, quotaBytes = getMediaStorageQuotaBytes()) {
  if (!Number.isSafeInteger(incomingBytes) || incomingBytes < 0) return true;
  return mediaStorageStatus(usedBytes, quotaBytes).remainingBytes < incomingBytes;
}
