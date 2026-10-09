import type { Surface } from "@/generation/catalog"

import { defaultKv, type Kv } from "./kv"

export type RunStatus = "running" | "completed" | "failed"

/** One generation request and everything the studio shows about it. */
export interface RunRecord {
  id: string
  /** Platform request id; running rows resume their poll from it after a reload. */
  requestId: string
  surface: Surface
  modelId: string
  modelLabel: string
  prompt: string
  settings: Record<string, unknown>
  /** Owning project, when generated from a project view. */
  projectId?: string
  /** Aspect ratio as width / height, used by the justified feed before media loads. */
  aspect: number
  status: RunStatus
  /** Result URLs: one video or N images. */
  urls: string[]
  error?: string
  createdAt: number
}

const KEY = "history.v1"
const MAX_RECORDS = 400

export async function loadHistory(kv: Kv = defaultKv()): Promise<RunRecord[]> {
  const stored = await kv.get<unknown>(KEY)
  if (!Array.isArray(stored)) return []
  return stored.filter(isRunRecord)
}

export async function saveHistory(
  records: RunRecord[],
  kv: Kv = defaultKv()
): Promise<void> {
  await kv.set(KEY, records.slice(0, MAX_RECORDS))
}

function isRunRecord(value: unknown): value is RunRecord {
  if (value === null || typeof value !== "object") return false
  const r = value as Record<string, unknown>
  return (
    typeof r.id === "string" &&
    typeof r.requestId === "string" &&
    typeof r.modelId === "string" &&
    typeof r.prompt === "string" &&
    typeof r.createdAt === "number" &&
    Array.isArray(r.urls)
  )
}

/** Parses "16:9" / "9:16" / "1:1" style enum values; 1 when unknown. */
export function aspectFromSettings(settings: Record<string, unknown>): number {
  const raw = settings.aspect_ratio ?? settings.aspectRatio ?? settings.ratio
  if (typeof raw !== "string") return 1
  const [w, h] = raw.split(/[:x/]/).map(Number)
  return w && h ? w / h : 1
}
