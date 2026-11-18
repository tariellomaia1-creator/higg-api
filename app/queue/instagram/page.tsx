import type { Metadata } from "next"

import { QueuePlanner } from "@/components/daily/queue-planner"

/** Posting now may first put the behero.ge badge on a video (ffmpeg). */
export const maxDuration = 300

export const metadata: Metadata = { title: "Auto posting · Instagram · BeHero Daily" }

export default function InstagramQueuePage() {
  return <QueuePlanner channel="ig" />
}
