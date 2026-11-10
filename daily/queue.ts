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
import type { QueueItem, QueueStatus } from "./db"
import { kieApiKey, uploadToKie } from "./kie"
import type { MetaConfig } from "./meta"
import { postToMeta } from "./publish"
import { DEFAULT_QUEUE_TIMES, nextSlots, parseTimes } from "./queue-schedule"

export type QueueSettings = {
  enabled: boolean
  times: string[]
  deleteAfter: boolean
  /** Caption every uploaded file starts with; editable per file. */
  defaultCaption: string
}

export const DEFAULT_QUEUE_CAPTION =
  "ნუ ხარჯავ დროს იმაზე, რაც უკვე იცი. 🎯\n\nbehero.ge-ზე  მათემატიკაში მასწავლებლისა და ეროვნული გამოცდისთვის:\n🎬 საგამოცდო ტესტის ვიდეოამოხსნა\n📝 ანალოგიური ტესტები სავარჯიშოდ\n🔁 ვარჯიში მხოლოდ შენს შეცდომებზე\n🎯 ვარჯიში მხოლოდ სუსტ თემებზე\n\n🎁 მოგვწერე და სცადე უფასოდ!"

export async function readQueueSettings(): Promise<QueueSettings> {
  const [enabled, times, deleteAfter, defaultCaption] = await Promise.all([
    getSetting("queue_enabled"),
    getSetting("queue_times"),
    getSetting("queue_delete_after"),
    getSetting("queue_default_caption"),
  ])
  let parsedTimes: string[] = []
  try {
    parsedTimes = parseTimes(times ? JSON.parse(times) : DEFAULT_QUEUE_TIMES)
  } catch {
    parsedTimes = DEFAULT_QUEUE_TIMES
  }
  return {
    enabled: enabled !== "off",
    times: parsedTimes.length ? parsedTimes : DEFAULT_QUEUE_TIMES,
    deleteAfter: deleteAfter !== "off",
    defaultCaption: defaultCaption ?? DEFAULT_QUEUE_CAPTION,
  }
}

/** Gives every waiting item the next free posting time, in queue order,
    starting just after now. Called after any change to the queue. */
export async function rescheduleQueue(now = new Date()): Promise<void> {
  const settings = await readQueueSettings()
  const waiting = await listQueuedInOrder()
  const slots = nextSlots(new Date(now.getTime() + 60_000), settings.times, waiting.length)
  for (const [index, item] of waiting.entries())
    if (item.scheduledAt !== (slots[index] ?? null)) await setQueueSchedule(item.id, slots[index] ?? null)
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


/** One posting step for a queue item; deletes the file once fully posted
    when that setting is on. */
export async function advanceQueueItem(meta: MetaConfig, item: QueueItem): Promise<QueueStatus> {
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
    caption: item.caption || (await readQueueSettings()).defaultCaption,
    state: { fbPostId: item.fbPostId, igContainerId: item.igContainerId, igMediaId: item.igMediaId },
    continuing,
    previousError: item.error,
    targets: { facebook: item.toFacebook, instagram: item.toInstagram },
  })
  const status: QueueStatus = outcome.status === "waiting" ? "queued" : outcome.status
  await saveQueuePublish(item.id, {
    status,
    fbPostId: outcome.fbPostId,
    igContainerId: outcome.igContainerId,
    igMediaId: outcome.igMediaId,
    error: outcome.error,
  })
  if (status === "published" && item.mediaUrl && (await readQueueSettings()).deleteAfter) {
    await del(item.mediaUrl).catch(() => undefined)
    await clearQueueMedia(item.id)
  }
  return status
}

/** Scheduler step: finish posts in progress, then start at most one due post
    (so posts stay at least one pass apart even after an outage). */
export async function processQueue(
  meta: MetaConfig,
  now = new Date()
): Promise<{ published: number; notes: string[] }> {
  const report = { published: 0, notes: [] as string[] }
  for (const item of await listQueuePublishing()) {
    try {
      if ((await advanceQueueItem(meta, item)) === "published") report.published++
    } catch (caught) {
      report.notes.push(`Queue ${item.fileName}: ${message(caught)}`)
    }
  }
  if (!(await readQueueSettings()).enabled) return report
  const due = await nextDueQueueItem(now.toISOString())
  if (due) {
    try {
      if ((await advanceQueueItem(meta, due)) === "published") report.published++
    } catch (caught) {
      report.notes.push(`Queue ${due.fileName}: ${message(caught)}`)
    }
  }
  return report
}
