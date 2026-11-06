import type { Metadata } from "next"

import { BatchPlanner } from "@/components/daily/batch-planner"

export const metadata: Metadata = { title: "Batch · BeHero Daily" }

export default function BatchPage() {
  return <BatchPlanner />
}
