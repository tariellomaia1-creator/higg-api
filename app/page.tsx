import type { Metadata } from "next"

import { DailyPlanner } from "@/components/daily/daily-planner"

export const metadata: Metadata = { title: "BeHero Daily" }

export default function Page() {
  return <DailyPlanner />
}
