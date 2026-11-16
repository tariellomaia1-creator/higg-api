import type { Metadata } from "next"

import { QueuePlanner } from "@/components/daily/queue-planner"

export const metadata: Metadata = { title: "Auto posting · Instagram · BeHero Daily" }

export default function InstagramQueuePage() {
  return <QueuePlanner channel="ig" />
}
