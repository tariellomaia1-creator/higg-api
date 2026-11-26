"use client"

import { uploadPresigned } from "@vercel/blob/client"

/** Uploads one file where this deployment keeps files: Vercel Blob (direct
    presigned upload) or the server's own disk (chunked POSTs to
    /api/daily/upload/local). Returns the stored URL to save. */

const CHUNK = 8 * 1024 * 1024
const MULTIPART_FROM = 40 * 1024 * 1024

let modePromise: Promise<"blob" | "local"> | null = null

function storageMode(): Promise<"blob" | "local"> {
  modePromise ??= fetch("/api/daily/upload", { cache: "no-store" })
    .then((response) => response.json() as Promise<{ storage?: unknown }>)
    .then((data) => (data.storage === "local" ? "local" : "blob"))
    .catch(() => {
      modePromise = null
      return "blob" as const
    })
  return modePromise
}

function randomId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export async function uploadStoredFile(
  pathname: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  if ((await storageMode()) === "blob") {
    const blob = await uploadPresigned(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/daily/upload",
      contentType: file.type,
      multipart: file.size > MULTIPART_FROM,
      onUploadProgress: onProgress ? ({ percentage }) => onProgress(Math.round(percentage)) : undefined,
    })
    return blob.url
  }
  const id = randomId()
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const chunk = file.slice(offset, Math.min(offset + CHUNK, file.size))
    let response: Response | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch("/api/daily/upload/local", {
          method: "POST",
          headers: {
            "x-upload-id": id,
            "x-upload-path": encodeURIComponent(pathname),
            "x-upload-type": file.type,
            "x-upload-offset": String(offset),
            "x-upload-total": String(file.size),
            "content-type": "application/octet-stream",
          },
          body: chunk,
        })
        if (response.ok || response.status < 500) break
      } catch {
        response = null
      }
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
    }
    const data = (await response?.json().catch(() => null)) as { url?: unknown; error?: unknown } | null
    if (!response?.ok)
      throw new Error(typeof data?.error === "string" ? data.error : "ატვირთვა ვერ მოხერხდა (კავშირი).")
    onProgress?.(Math.round(((offset + chunk.size) / file.size) * 100))
    if (typeof data?.url === "string") return data.url
  }
  throw new Error("ატვირთვა ბოლომდე ვერ დასრულდა.")
}
