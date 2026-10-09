import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import {
  decodeCredentials,
  PLATFORM_KEY_COOKIE,
} from "@/generation/credentials"
import { createPlatformClient, PlatformError } from "@/generation/platform"
import { requireUploadContentType } from "@/generation/upload-contract"

export async function POST(request: Request): Promise<NextResponse> {
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin)
    return failure(403, "Cross-origin upload requests are not allowed.")

  let contentType: string
  try {
    const body: unknown = await request.json()
    contentType = requireUploadContentType(
      body && typeof body === "object" && "contentType" in body
        ? body.contentType
        : null
    )
  } catch (error) {
    return failure(
      400,
      error instanceof SyntaxError
        ? "Invalid upload request."
        : "Unsupported file type. Use JPEG, PNG, WebP, GIF, MP4, or WAV."
    )
  }

  const jar = await cookies()
  const credentials = decodeCredentials(jar.get(PLATFORM_KEY_COOKIE)?.value)
  if (!credentials)
    return failure(
      401,
      "Connect your Higgsfield API key in the sidebar before uploading."
    )
  const baseUrl = process.env.HF_API_BASE_URL
  if (!baseUrl)
    return failure(
      503,
      "Uploads are not configured. Set HF_API_BASE_URL on the server."
    )

  try {
    const ticket = await createPlatformClient({
      ...credentials,
      baseUrl,
    }).createUpload(contentType)
    return NextResponse.json(ticket, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const status = error instanceof PlatformError ? error.status : 502
    console.error("[upload] Could not prepare reference upload", { status })
    if (status === 401 || status === 403)
      return failure(
        status,
        "Higgsfield rejected your API key. Update it in the sidebar and try again."
      )
    if (status === 429)
      return failure(
        429,
        "Higgsfield upload rate limit reached. Wait a moment and try again."
      )
    return failure(
      502,
      "Could not prepare reference upload with Higgsfield. Try again."
    )
  }
}

function failure(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } }
  )
}
