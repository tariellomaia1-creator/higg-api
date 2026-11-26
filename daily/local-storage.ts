import "server-only"

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { Readable } from "node:stream"

/** Files on the server's own disk, for hosts without Vercel Blob (such as
    Hostinger). Stored files are referenced as "local:<relative path>", e.g.
    "local:daily/queue/ab12-clip.mp4". The folder lives outside the app so
    redeploys keep it: STORAGE_DIR, or ~/autopost-storage. */

export const LOCAL_PREFIX = "local:"

/** Local storage is used when STORAGE_DIR is set or no Blob store is linked. */
export function localStorageEnabled(): boolean {
  if (process.env.STORAGE_DIR?.trim()) return true
  return !(process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_STORE_ID?.trim())
}

export function storageRoot(): string {
  return path.resolve(process.env.STORAGE_DIR?.trim() || path.join(homedir(), "autopost-storage"))
}

export function isLocalUrl(value: string): boolean {
  return value.startsWith(LOCAL_PREFIX) && Boolean(safeRelative(value.slice(LOCAL_PREFIX.length)))
}

/** A relative path inside the storage folder, or null if it would escape it. */
function safeRelative(relative: string): string | null {
  const clean = path.posix.normalize(relative.replace(/\\/g, "/")).replace(/^\/+/, "")
  if (!clean || clean.startsWith("..") || clean.includes("/../") || clean.includes("\0")) return null
  return clean
}

function absolute(url: string): string {
  const relative = safeRelative(url.slice(LOCAL_PREFIX.length))
  if (!url.startsWith(LOCAL_PREFIX) || !relative) throw new Error("Unknown file.")
  return path.join(storageRoot(), relative)
}

/** "daily/queue/clip one.mp4" → "daily/queue/<random>-clip_one.mp4". */
export function uniqueRelative(pathname: string): string {
  const dir = path.posix.dirname(pathname.replace(/\\/g, "/"))
  const base = path.posix.basename(pathname).replace(/[^\w.-]+/g, "_").slice(-80) || "file"
  return `${dir === "." ? "" : `${dir}/`}${randomUUID().slice(0, 12)}-${base}`
}

export async function storeLocalFile(pathname: string, body: Buffer): Promise<string> {
  const relative = safeRelative(uniqueRelative(pathname))
  if (!relative) throw new Error("Invalid file path.")
  const target = path.join(storageRoot(), relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, body)
  return `${LOCAL_PREFIX}${relative}`
}

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
}

function contentTypeOf(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream"
}

/** Streams a stored file, honouring a single "bytes=a-b" range. */
export async function openLocalFile(url: string, range?: string | null): Promise<Response> {
  const file = absolute(url)
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) throw new Error("Stored file is not readable (missing).")
  const size = info.size
  const headers = new Headers({
    "content-type": contentTypeOf(file),
    "accept-ranges": "bytes",
    "last-modified": info.mtime.toUTCString(),
  })
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
  if (match && (match[1] || match[2])) {
    let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
    let end = match[1] && match[2] ? Number(match[2]) : size - 1
    end = Math.min(end, size - 1)
    if (start > end || start >= size) {
      headers.set("content-range", `bytes */${size}`)
      return new Response(null, { status: 416, headers })
    }
    start = Math.max(0, start)
    headers.set("content-range", `bytes ${start}-${end}/${size}`)
    headers.set("content-length", String(end - start + 1))
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>
    return new Response(stream, { status: 206, headers })
  }
  headers.set("content-length", String(size))
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>
  return new Response(stream, { status: 200, headers })
}

export async function deleteLocalFile(url: string): Promise<void> {
  await rm(absolute(url), { force: true })
}

// ------------------------------------------------------------ signed links

function linkSecret(): string {
  const secret =
    process.env.FILE_LINK_SECRET?.trim() || process.env.CRON_SECRET?.trim() || process.env.SITE_PASSWORD?.trim()
  if (!secret) throw new Error("Set CRON_SECRET (used to sign file links).")
  return secret
}

function signature(relative: string, expires: number): string {
  return createHmac("sha256", linkSecret()).update(`${relative}\n${expires}`).digest("hex")
}

/** The site's public address, for links Meta and kie.ai download from. */
export function siteUrl(): string {
  const value = (process.env.SITE_URL || process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\//.test(value)) throw new Error("Set SITE_URL (e.g. https://autopost.liz.ge) so Meta can download files.")
  return value
}

/** A link anyone can open until it expires: /api/daily/file?p=…&e=…&s=… */
export function signedLocalUrl(url: string, hours: number): string {
  const relative = safeRelative(url.slice(LOCAL_PREFIX.length))
  if (!relative) throw new Error("Unknown file.")
  const expires = Math.floor(Date.now() / 1000) + Math.round(hours * 3600)
  const name = path.posix.basename(relative)
  const query = new URLSearchParams({ p: relative, e: String(expires), s: signature(relative, expires) })
  // The file name at the end helps services that look at the URL's extension.
  return `${siteUrl()}/api/daily/file/${encodeURIComponent(name)}?${query}`
}

/** The stored file a signed link points to, or null if it is invalid or expired. */
export function verifySignedLink(params: URLSearchParams): string | null {
  const relative = safeRelative(params.get("p") ?? "")
  const expires = Number(params.get("e"))
  const given = params.get("s") ?? ""
  if (!relative || !Number.isFinite(expires) || expires < Date.now() / 1000) return null
  const expected = Buffer.from(signature(relative, expires))
  const actual = Buffer.from(given)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  return `${LOCAL_PREFIX}${relative}`
}

// ------------------------------------------------------------ chunked upload

const UPLOAD_ID = /^[a-zA-Z0-9-]{8,64}$/

/** Appends one chunk of a browser upload. When the last chunk arrives the
    file moves to its final place and its "local:" URL is returned. */
export async function appendUploadChunk(input: {
  id: string
  pathname: string
  offset: number
  total: number
  chunk: Buffer
}): Promise<string | null> {
  if (!UPLOAD_ID.test(input.id)) throw new Error("Invalid upload id.")
  const partialDir = path.join(storageRoot(), ".partial")
  await mkdir(partialDir, { recursive: true })
  const partial = path.join(partialDir, input.id)
  const current = (await stat(partial).catch(() => null))?.size ?? 0
  if (input.offset === 0 && current > 0) await rm(partial, { force: true })
  else if (input.offset !== current) throw new Error(`Upload out of order (expected byte ${current}).`)
  const handle = await open(partial, input.offset === 0 ? "w" : "a")
  try {
    await handle.write(input.chunk)
  } finally {
    await handle.close()
  }
  const written = input.offset + input.chunk.length
  if (written > input.total) {
    await rm(partial, { force: true })
    throw new Error("Upload larger than announced.")
  }
  if (written < input.total) return null
  const relative = safeRelative(uniqueRelative(input.pathname))
  if (!relative) throw new Error("Invalid file path.")
  const target = path.join(storageRoot(), relative)
  await mkdir(path.dirname(target), { recursive: true })
  await rename(partial, target)
  return `${LOCAL_PREFIX}${relative}`
}
