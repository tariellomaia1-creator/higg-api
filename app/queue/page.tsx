import type { Metadata } from "next"

import { QueuePlanner } from "@/components/daily/queue-planner"

export const metadata: Metadata = { title: "Auto posting · BeHero Daily" }

export default function QueuePage() {
  return <QueuePlanner />
}
