import { NextResponse } from "next/server"

import { safeEqual } from "@/daily/auth"
import { runTick } from "@/daily/pipeline"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Called by the scheduler (GitHub Actions) every few minutes with
    `Authorization: Bearer $CRON_SECRET`. */
async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET?.trim()
  const header = request.headers.get("authorization") ?? ""
  if (!secret || !safeEqual(header, `Bearer ${secret}`))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const report = await runTick()
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    console.error("[daily] tick failed", caught)
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : String(caught) },
      { status: 500 }
    )
  }
}

export const GET = handle
export const POST = handle
