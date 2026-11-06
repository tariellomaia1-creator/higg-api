import { NextResponse } from "next/server"

import { isBlobUrl, openFile } from "@/daily/blob-server"
import { requireSession } from "@/daily/session"

export const dynamic = "force-dynamic"

/** Streams a stored start image or result to the signed-in planner, so files
    in a private Blob store can be previewed, played (with seeking) and
    downloaded. `?u=<blob url>`, add `&download=<file name>` to save. */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession()
  } catch {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  }
  const params = new URL(request.url).searchParams
  const target = params.get("u") ?? ""
  if (!isBlobUrl(target))
    return NextResponse.json({ error: "Unknown file." }, { status: 400 })
  try {
    const upstream = await openFile(target, request.headers.get("range"))
    const headers = new Headers()
    for (const name of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
    ]) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes")
    headers.set("cache-control", "private, max-age=3600")
    const download = params.get("download")
    if (download) {
      const safe = download.replace(/[^\w.-]+/g, "_").slice(0, 80) || "file"
      headers.set("content-disposition", `attachment; filename="${safe}"`)
    }
    return new Response(upstream.body, { status: upstream.status, headers })
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "File not readable." },
      { status: 404 }
    )
  }
}
