import type { Metadata } from "next"

import { QueuePlanner } from "@/components/daily/queue-planner"

/** Posting now may first put the behero.ge badge on a video (ffmpeg). */
export const maxDuration = 300

export const metadata: Metadata = { title: "Auto posting · Facebook · BeHero Daily" }

export default function QueuePage() {
  return <QueuePlanner channel="fb" />
}
