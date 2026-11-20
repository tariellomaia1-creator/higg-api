import type { Metadata } from "next"

import { QueuePlanner } from "@/components/daily/queue-planner"

/** Posting now may first prepare the file (ffmpeg / image conversion). */
export const maxDuration = 300

export const metadata: Metadata = { title: "Auto posting · BeHero Daily" }

/** Queue of another Facebook Page or Instagram account ("fbp_…" / "igu_…"). */
export default async function ChannelQueuePage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params
  return <QueuePlanner channel={channel} />
}
