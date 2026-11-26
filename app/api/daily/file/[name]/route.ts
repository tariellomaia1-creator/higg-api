import { NextResponse } from "next/server"

import { openLocalFile, verifySignedLink } from "@/daily/local-storage"

export const dynamic = "force-dynamic"

/** A stored file behind a time-limited signed link (?p=&e=&s=), for Meta,
    kie.ai and the planner's direct previews. The [name] segment is the file
    name, for services that look at the URL's extension. */
export async function GET(request: Request): Promise<Response> {
  const file = verifySignedLink(new URL(request.url).searchParams)
  if (!file) return NextResponse.json({ error: "Link expired or invalid." }, { status: 403 })
  try {
    const response = await openLocalFile(file, request.headers.get("range"))
    response.headers.set("cache-control", "private, max-age=3600")
    return response
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 })
  }
}
