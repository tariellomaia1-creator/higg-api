import { NextResponse } from "next/server"

import { appendUploadChunk } from "@/daily/local-storage"
import { requireSession } from "@/daily/session"
import { limitsFor } from "@/daily/upload-limits"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Largest chunk the browser sends; keeps each request under hosting limits. */
const MAX_CHUNK = 16 * 1024 * 1024

/** One chunk of a browser upload to the server's disk. Headers: x-upload-id,
    x-upload-path (daily/start/… or daily/queue/…), x-upload-type,
    x-upload-offset, x-upload-total; the body is the raw bytes. Answers
    { url } once the last chunk is in, { received } before that. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireSession()
  } catch {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  }
  try {
    const id = request.headers.get("x-upload-id") ?? ""
    const pathname = decodeURIComponent(request.headers.get("x-upload-path") ?? "")
    const type = request.headers.get("x-upload-type") ?? ""
    const offset = Number(request.headers.get("x-upload-offset"))
    const total = Number(request.headers.get("x-upload-total"))
    const { types, maxBytes } = limitsFor(pathname)
    if (!types.includes(type)) throw new Error("This file type is not accepted.")
    if (!Number.isInteger(total) || total <= 0 || total > maxBytes)
      throw new Error(`File too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`)
    if (!Number.isInteger(offset) || offset < 0 || offset >= total) throw new Error("Invalid upload offset.")
    const chunk = Buffer.from(await request.arrayBuffer())
    if (chunk.length === 0 || chunk.length > MAX_CHUNK) throw new Error("Invalid upload chunk.")
    const url = await appendUploadChunk({ id, pathname, offset, total, chunk })
    return NextResponse.json(url ? { url } : { received: offset + chunk.length })
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Upload failed." },
      { status: 400 }
    )
  }
}
