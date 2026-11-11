/** Posting times for the auto-posting queue, in Tbilisi time (UTC+4 all
    year). Pure, so the server and the planner agree on the slots. */

export const DEFAULT_QUEUE_TIMES = ["10:00", "13:00", "17:00", "21:00", "23:00"]

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

export type SlotKind = "video" | "image" | "any"
export const SLOT_KINDS: SlotKind[] = ["video", "image", "any"]

/** Which kind of file each time posts: 3 videos and 2 images a day,
    alternating. Times not listed here take any file. */
export const DEFAULT_SLOT_KINDS: Record<string, SlotKind> = {
  "10:00": "video",
  "13:00": "image",
  "17:00": "video",
  "21:00": "image",
  "23:00": "video",
}

export function parseSlotKinds(value: unknown): Record<string, SlotKind> {
  const data = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const out: Record<string, SlotKind> = {}
  for (const [time, kind] of Object.entries(data)) {
    const [normalized] = parseTimes([time])
    const valid = SLOT_KINDS.find((k) => k === kind)
    if (normalized && valid) out[normalized] = valid
  }
  return out
}

export function kindAt(time: string, kinds: Record<string, SlotKind>): SlotKind {
  return kinds[time] ?? "any"
}

const TBILISI_MS = 4 * 60 * 60 * 1000

function tbilisiTime(iso: string): string {
  const local = new Date(Date.parse(iso) + TBILISI_MS)
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`
}

/** Gives each waiting file a posting time. Video slots take the next video,
    image slots the next image, "any" slots whichever comes first in the
    queue. When one kind runs out, its slots take the other kind, so the
    queue never stalls. Returns id → ISO time, in queue order per kind. */
export function assignSlots(
  items: Array<{ id: string; kind: "video" | "image" }>,
  from: Date,
  times: string[],
  kinds: Record<string, SlotKind>
): Map<string, string> {
  const videos = items.filter((item) => item.kind === "video")
  const images = items.filter((item) => item.kind === "image")
  const order = new Map(items.map((item, index) => [item.id, index]))
  const result = new Map<string, string>()
  const slots = nextSlots(from, times, items.length * 3 + 10)
  for (const at of slots) {
    if (!videos.length && !images.length) break
    const want = kindAt(tbilisiTime(at), kinds)
    let pick: { id: string; kind: "video" | "image" } | undefined
    if (want === "video") pick = videos.shift() ?? images.shift()
    else if (want === "image") pick = images.shift() ?? videos.shift()
    else {
      const v = videos[0]
      const i = images[0]
      pick = v && (!i || order.get(v.id)! < order.get(i.id)!) ? videos.shift() : images.shift()
    }
    if (pick) result.set(pick.id, at)
  }
  return result
}
