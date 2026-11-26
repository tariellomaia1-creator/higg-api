/** Whether stored files can be kept: Vercel Blob (a read-write token or
    BLOB_STORE_ID with the deployment's OIDC identity), or otherwise the
    server's own disk (daily/local-storage.ts), which is always available. */
export function blobConfigured(): boolean {
  return true
}

/** Vercel Blob is linked; otherwise files go to the server's disk. */
export function usesVercelBlob(): boolean {
  if (process.env.STORAGE_DIR?.trim()) return false
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_STORE_ID?.trim())
}
