import type { Metadata } from "next"

import { QueuePlanner } from "@/components/daily/queue-planner"

export const metadata: Metadata = { title: "Auto posting · Facebook · BeHero Daily" }

export default function QueuePage() {
  return <QueuePlanner channel="fb" />
}
