import "server-only"

import { del } from "@vercel/blob"
import sharp from "sharp"

import { readFile, signedReadUrl } from "./blob-server"
import {
  clearQueueMedia,
  getSetting,
  listQueuePublishing,
  listQueuedInOrder,
  nextDueQueueItem,
  saveQueuePublish,
  setQueueSchedule,
} from "./db"
import type { QueueChannel, QueueItem, QueueStatus } from "./db"
import { kieApiKey, uploadToKie } from "./kie"
import type { MetaConfig } from "./meta"
import { postToMeta } from "./publish"
import {
  DEFAULT_IG_SLOT_KINDS,
  DEFAULT_IG_TIMES,
  DEFAULT_QUEUE_TIMES,
  DEFAULT_SLOT_KINDS,
  assignSlots,
  parseSlotKinds,
  parseTimes,
} from "./queue-schedule"
import type { SlotKind } from "./queue-schedule"

export type QueueSettings = {
  enabled: boolean
  times: string[]
  deleteAfter: boolean
  /** Caption every uploaded file starts with; editable per file. */
  defaultCaption: string
  /** Which kind of file each time posts. */
  slotKinds: Record<string, SlotKind>
}

export const DEFAULT_QUEUE_CAPTION =
  "ნუ ხარჯავ დროს იმაზე, რაც უკვე იცი. 🎯\n\nbehero.ge-ზე  მათემატიკაში მასწავლებლისა და ეროვნული გამოცდისთვის:\n🎬 საგამოცდო ტესტის ვიდეოამოხსნა\n📝 ანალოგიური ტესტები სავარჯიშოდ\n🔁 ვარჯიში მხოლოდ შენს შეცდომებზე\n🎯 ვარჯიში მხოლოდ სუსტ თემებზე\n\n🎁 მოგვწერე და სცადე უფასოდ!"

export const QUEUE_CHANNELS: QueueChannel[] = ["fb", "ig"]

export function asChannel(value: unknown): QueueChannel {
  return value === "ig" ? "ig" : "fb"
}

/** Settings keys: Facebook keeps the original "queue_*" keys, Instagram
    has its own "ig_queue_*" set. */
export function queueSettingKey(channel: QueueChannel, name: string): string {
  return channel === "ig" ? `ig_queue_${name}` : `queue_${name}`
}

export async function readQueueSettings(channel: QueueChannel): Promise<QueueSettings> {
  const key = (name: string) => queueSettingKey(channel, name)
  const defaultTimes = channel === "ig" ? DEFAULT_IG_TIMES : DEFAULT_QUEUE_TIMES
  const defaultKinds = channel === "ig" ? DEFAULT_IG_SLOT_KINDS : DEFAULT_SLOT_KINDS
  const [enabled, times, deleteAfter, defaultCaption, slotKinds] = await Promise.all([
    getSetting(key("enabled")),
    getSetting(key("times")),
    getSetting(key("delete_after")),
    getSetting(key("default_caption")),
    getSetting(key("slot_kinds")),
  ])
  let parsedKinds: Record<string, SlotKind> = defaultKinds
  try {
    if (slotKinds) parsedKinds = parseSlotKinds(JSON.parse(slotKinds))
  } catch {
    parsedKinds = defaultKinds
  }
  let parsedTimes: string[] = []
  try {
    parsedTimes = parseTimes(times ? JSON.parse(times) : defaultTimes)
  } catch {
    parsedTimes = defaultTimes
  }
  return {
    enabled: enabled !== "off",
    times: parsedTimes.length ? parsedTimes : defaultTimes,
    deleteAfter: deleteAfter !== "off",
    defaultCaption: defaultCaption ?? DEFAULT_QUEUE_CAPTION,
    slotKinds: parsedKinds,
  }
}

/** Gives every waiting item a posting time: videos to video slots, images
    to image slots, in queue order, starting just after now. Called after any
    change to the queue. */
export async function rescheduleQueue(channel: QueueChannel, now = new Date()): Promise<void> {
  const settings = await readQueueSettings(channel)
  const waiting = await listQueuedInOrder(channel)
  const plan = assignSlots(waiting, new Date(now.getTime() + 60_000), settings.times, settings.slotKinds)
  for (const item of waiting) {
    const at = plan.get(item.id) ?? null
    if (item.scheduledAt !== at) await setQueueSchedule(item.id, at)
  }
}

function message(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught)
}

/** Meta must download the file: a signed link for videos and JPEGs; other
    images are converted to JPEG (Instagram's only image format) and put in
    kie.ai's temporary storage. */
async function mediaForMeta(item: QueueItem): Promise<string> {
  const url = item.mediaUrl!
  const jpeg = /jpe?g/i.test(item.mediaType)
  if (item.kind === "video" || jpeg) return signedReadUrl(url)
  const key = kieApiKey()
  if (!key) throw new Error("KIE_API_KEY is not set.")
  const { bytes } = await readFile(url)
  const converted = await sharp(bytes).jpeg({ quality: 92 }).toBuffer()
  return uploadToKie(key, converted, "image/jpeg", `${item.id}.jpg`)
}


/** One posting step for a queue item, to its channel only; deletes the file
    once posted when that setting is on. */
export async function advanceQueueItem(meta: MetaConfig, item: QueueItem): Promise<QueueStatus> {
  const settings = await readQueueSettings(item.channel)
  const continuing = item.status === "publishing"
  let media: string | null = null
  if (!continuing) {
    if (!item.mediaUrl) throw new Error("ფაილი აღარ არის საცავში.")
    try {
      media = await mediaForMeta(item)
    } catch (caught) {
      await saveQueuePublish(item.id, {
        status: "failed",
        fbPostId: item.fbPostId,
        igContainerId: item.igContainerId,
        igMediaId: item.igMediaId,
        error: `ფაილის ბმული ვერ შეიქმნა: ${message(caught)}`,
      })
      return "failed"
    }
  }
  const outcome = await postToMeta(meta, {
    kind: item.kind === "video" ? "video" : "poster",
    mediaUrl: media,
    caption: item.caption || settings.defaultCaption,
    state: { fbPostId: item.fbPostId, igContainerId: item.igContainerId, igMediaId: item.igMediaId },
    continuing,
    previousError: item.error,
    targets: { facebook: item.channel === "fb", instagram: item.channel === "ig" },
  })
  const status: QueueStatus = outcome.status === "waiting" ? "queued" : outcome.status
  await saveQueuePublish(item.id, {
    status,
    fbPostId: outcome.fbPostId,
    igContainerId: outcome.igContainerId,
    igMediaId: outcome.igMediaId,
    error: outcome.error,
  })
  if (status === "published" && item.mediaUrl && settings.deleteAfter) {
    await del(item.mediaUrl).catch(() => undefined)
    await clearQueueMedia(item.id)
  }
  return status
}

/** Scheduler step for every channel: finish posts in progress, then start
    at most one due post per channel (so posts stay at least one pass apart
    even after an outage). */
export async function processQueue(
  meta: MetaConfig,
  now = new Date()
): Promise<{ published: number; notes: string[] }> {
  const report = { published: 0, notes: [] as string[] }
  for (const channel of QUEUE_CHANNELS) {
    if (channel === "ig" && !meta.igUserId) continue
    const part = await processChannel(meta, channel, now)
    report.published += part.published
    report.notes.push(...part.notes)
  }
  return report
}

async function processChannel(
  meta: MetaConfig,
  channel: QueueChannel,
  now: Date
): Promise<{ published: number; notes: string[] }> {
  const report = { published: 0, notes: [] as string[] }
  for (const item of await listQueuePublishing(channel)) {
    try {
      if ((await advanceQueueItem(meta, item)) === "published") report.published++
    } catch (caught) {
      report.notes.push(`Queue ${item.fileName}: ${message(caught)}`)
    }
  }
  if (!(await readQueueSettings(channel)).enabled) return report
  const due = await nextDueQueueItem(channel, now.toISOString())
  if (due) {
    try {
      if ((await advanceQueueItem(meta, due)) === "published") report.published++
    } catch (caught) {
      report.notes.push(`Queue ${due.fileName}: ${message(caught)}`)
    }
  }
  return report
}
