import "server-only"

import { get, put } from "@vercel/blob"

/** Vercel Blob helpers that work whether the store was created public or
    private. Newer stores are often private: their URLs cannot be opened by a
    browser or by kie.ai, so reads go through the SDK and the browser gets the
    file through /api/daily/media. */

export function isBlobUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".blob.vercel-storage.com")
    )
  } catch {
    return false
  }
}

/** Stores a file, public if the store allows it, otherwise private. */
export async function storeFile(
  pathname: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  try {
    const blob = await put(pathname, body, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    })
    return blob.url
  } catch (publicError) {
    try {
      const blob = await put(pathname, body, {
        access: "private",
        contentType,
        addRandomSuffix: true,
      })
      return blob.url
    } catch {
      throw publicError
    }
  }
}

/** Opens a stored file for reading, trying a private read first (it also
    works for this store's public files) and a plain public fetch last. */
export async function openFile(
  url: string,
  range?: string | null
): Promise<Response> {
  const headers = range ? { Range: range } : undefined
  for (const access of ["private", "public"] as const) {
    try {
      const result = await get(url, { access, ...(headers ? { headers } : {}) })
      if (result && result.stream) {
        const status = result.headers.get("content-range") ? 206 : 200
        const copied = new Headers()
        result.headers.forEach((value, name) => copied.set(name, value))
        return new Response(result.stream, { status, headers: copied })
      }
    } catch {
      // Try the next way of reading.
    }
  }
  const response = await fetch(url, {
    cache: "no-store",
    ...(headers ? { headers } : {}),
  })
  if (!response.ok) throw new Error(`Stored file is not readable (${response.status}).`)
  return response
}

export async function readFile(
  url: string
): Promise<{ bytes: Buffer; contentType: string }> {
  const response = await openFile(url)
  const bytes = Buffer.from(await response.arrayBuffer())
  return {
    bytes,
    contentType:
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      "application/octet-stream",
  }
}
