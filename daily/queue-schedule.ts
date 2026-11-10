/** Posting times for the auto-posting queue, in Tbilisi time (UTC+4 all
    year). Pure, so the server and the planner agree on the slots. */

export const DEFAULT_QUEUE_TIMES = ["10:00", "13:00", "16:00", "19:00", "22:00"]

const TBILISI_OFFSET_MS = 4 * 60 * 60 * 1000

export function parseTimes(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,;]+/)
      : []
  const times = list
    .map((entry) => String(entry).trim())
    .map((entry) => /^(\d{1,2}):(\d{2})$/.exec(entry))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [Number(match[1]), Number(match[2])] as const)
    .filter(([h, m]) => h >= 0 && h < 24 && m >= 0 && m < 60)
    .map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
  return [...new Set(times)].sort()
}

/** The next `count` posting moments after `from`, as ISO strings. */
export function nextSlots(from: Date, times: string[], count: number): string[] {
  const sorted = parseTimes(times)
  if (sorted.length === 0 || count <= 0) return []
  const slots: string[] = []
  const local = new Date(from.getTime() + TBILISI_OFFSET_MS)
  let y = local.getUTCFullYear()
  let mo = local.getUTCMonth()
  let d = local.getUTCDate()
  for (let guard = 0; slots.length < count && guard < 3660; guard++) {
    for (const time of sorted) {
      const [h, m] = time.split(":").map(Number) as [number, number]
      const at = Date.UTC(y, mo, d, h, m) - TBILISI_OFFSET_MS
      if (at > from.getTime()) slots.push(new Date(at).toISOString())
      if (slots.length >= count) break
    }
    const next = new Date(Date.UTC(y, mo, d + 1))
    y = next.getUTCFullYear()
    mo = next.getUTCMonth()
    d = next.getUTCDate()
  }
  return slots
}
