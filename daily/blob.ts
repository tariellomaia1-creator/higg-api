/** Vercel Blob is linked either with a read-write token (older stores) or with
    BLOB_STORE_ID plus the deployment's OIDC identity (newer stores). The SDK
    picks whichever is present. */
export function blobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
      process.env.BLOB_STORE_ID?.trim()
  )
}
