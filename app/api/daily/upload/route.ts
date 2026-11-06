import { handleUpload } from "@vercel/blob/client"
import type { HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

import { requireSession } from "@/daily/session"

/** Why an upload cannot start, in words the planner can show. The Blob client
    only reports "Failed to retrieve the client token" on any refusal. */
export async function GET(): Promise<NextResponse> {
  let signedIn = true
  try {
    await requireSession()
  } catch {
    signedIn = false
  }
  return NextResponse.json(
    { signedIn, blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN) },
    { headers: { "Cache-Control": "no-store" } }
  )
}

/** Issues a short-lived Vercel Blob client token for one start image. The
    browser uploads straight to Blob, so large photos skip the function body
    limit. Only a signed-in session gets a token. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireSession()
  } catch {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    return NextResponse.json(
      {
        error:
          "File storage is not connected. In Vercel, open Storage, create a Blob store and connect it to this project.",
      },
      { status: 503 }
    )
  try {
    const body = (await request.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("daily/start/"))
          throw new Error("Invalid upload path.")
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 20 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
    })
    return NextResponse.json(result)
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Upload failed." },
      { status: 400 }
    )
  }
}
