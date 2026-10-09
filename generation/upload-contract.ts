import type { MediaKind } from "./catalog/types"

const CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/wav",
  "audio/x-wav",
  "video/mp4",
])

export type UploadTicket = {
  upload_url: string
  public_url: string
  content_type: string
  upload_headers: Record<string, string>
}

export function requireUploadContentType(value: unknown): string {
  if (typeof value !== "string" || !CONTENT_TYPES.has(value)) {
    throw new Error(
      "Unsupported file type. Use JPEG, PNG, WebP, GIF, MP4, or WAV."
    )
  }
  return value
}

export function mediaKindFromMime(contentType: string): MediaKind {
  requireUploadContentType(contentType)
  if (contentType.startsWith("audio/")) return "audio"
  return contentType.startsWith("video/") ? "video" : "image"
}

export function parseUploadTicket(
  value: unknown,
  contentType: string
): UploadTicket {
  const invalid = () =>
    new Error("Invalid upload response from Higgsfield. Try again.")
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid()
  const data = value as Record<string, unknown>
  if (
    !isHttpsUrl(data.upload_url) ||
    !isHttpsUrl(data.public_url) ||
    data.content_type !== contentType
  )
    throw invalid()
  if (
    !data.upload_headers ||
    typeof data.upload_headers !== "object" ||
    Array.isArray(data.upload_headers)
  )
    throw invalid()
  const entries = Object.entries(data.upload_headers)
  if (
    entries.some(
      ([name, header]) =>
        typeof header !== "string" || /^(authorization|cookie)$/i.test(name)
    )
  )
    throw invalid()
  const headers = Object.fromEntries(entries) as Record<string, string>
  try {
    if (new Headers(headers).get("content-type") !== contentType)
      throw invalid()
  } catch {
    throw invalid()
  }
  return {
    upload_url: data.upload_url,
    public_url: data.public_url,
    content_type: contentType,
    upload_headers: headers,
  }
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password
  } catch {
    return false
  }
}
