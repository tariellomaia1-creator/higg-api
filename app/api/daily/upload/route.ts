import { issueSignedToken } from "@vercel/blob"
import { handleUploadPresigned } from "@vercel/blob/client"
import type { HandleUploadPresignedBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

import { blobConfigured } from "@/daily/blob"
import { requireSession } from "@/daily/session"

const START_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
const START_IMAGE_MAX_BYTES = 20 * 1024 * 1024
/** Finished videos and images for the auto-posting queue. */
const QUEUE_TYPES = ["video/mp4", "video/quicktime", "image/jpeg", "image/png", "image/webp"]
const QUEUE_MAX_BYTES = 1024 * 1024 * 1024

function limitsFor(pathname: string) {
  if (pathname.startsWith("daily/start/"))
    return { types: START_IMAGE_TYPES, maxBytes: START_IMAGE_MAX_BYTES }
  if (pathname.startsWith("daily/queue/"))
    return { types: QUEUE_TYPES, maxBytes: QUEUE_MAX_BYTES }
  throw new Error("Invalid upload path.")
}

/** Why an upload cannot start, in words the planner can show. The Blob client
    reports any refused request with one generic message. */
export async function GET(): Promise<NextResponse> {
  let signedIn = true
  try {
    await requireSession()
  } catch {
    signedIn = false
  }
  return NextResponse.json(
    { signedIn, blobConfigured: blobConfigured() },
    { headers: { "Cache-Control": "no-store" } }
  )
}

/** Issues a short-lived presigned upload URL for one start image or one
    queue file. The browser uploads straight to Blob, so large files skip the
    function body limit.
    Works with both a Blob read-write token and Vercel's OIDC store link
    (BLOB_STORE_ID). Only a signed-in session gets a URL. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireSession()
  } catch {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  }
  if (!blobConfigured())
    return NextResponse.json(
      {
        error:
          "File storage is not connected. In Vercel, open Storage, create a Blob store and connect it to this project.",
      },
      { status: 503 }
    )
  try {
    const body = (await request.json()) as HandleUploadPresignedBody
    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        const { types, maxBytes } = limitsFor(pathname)
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: types,
          maximumSizeInBytes: maxBytes,
          // Large videos upload in parts and may take a while.
          validUntil: Date.now() + 60 * 60 * 1000,
        })
        return {
          token,
          urlOptions: {
            allowedContentTypes: types,
            maximumSizeInBytes: maxBytes,
            addRandomSuffix: true,
          },
        }
      },
    })
    return NextResponse.json(result)
  } catch (caught) {
    console.error("[daily] upload token failed", caught)
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Upload failed." },
      { status: 400 }
    )
  }
}
