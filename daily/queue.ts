import "server-only"

import { del } from "@vercel/blob"
import sharp from "sharp"

import { readFile, signedReadUrl } from "./blob-server"
import { brandStoredVideo } from "./brand"
import { CAPTION_VARIANTS, parseVariants } from "./caption-variants"
import {
  channelMediaUrls,
  clearQueueMedia,
  countPublished,
  countQueueItems,
  insertQueueItems,
  otherMediaRefs,
  getSetting,
  listQueuePublishing,
  listQueuedInOrder,
  nextDueQueueItem,
  nextUnbrandedVideo,
  saveQueuePublish,
  setQueueBranded,
  setQueueBrandingByUrl,
  setQueueBrandingError,
  setQueueCaption,
  setQueueSchedule,
  setSetting,
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

/** Caption rewordings shared by both channels (setting "caption_variants",
    JSON list); the built-in list until edited. */
export async function readCaptionVariants(): Promise<string[]> {
  const stored = await getSetting("caption_variants")
  if (stored) {
    try {
      const list = JSON.parse(stored)
      if (Array.isArray(list)) {
        const clean = list.filter((v): v is string => typeof v === "string" && v.trim() !== "")
        if (clean.length) return clean
      }
    } catch {
      // fall through to the default list
    }
  }
  return CAPTION_VARIANTS
}

export async function saveCaptionVariants(text: string): Promise<string[]> {
  const list = parseVariants(text)
  if (list.length === 0) throw new Error("ჩაწერე მინიმუმ ერთი caption.")
  await setSetting("caption_variants", JSON.stringify(list))
  return list
}

/** The n-th caption of a channel. Instagram starts further along the list,
    so the same file posted on both channels rarely shares a caption. */
export function pickVariant(variants: string[], channel: QueueChannel, n: number): string {
  const offset = channel === "ig" ? Math.floor(variants.length / 2) : 0
  return variants[(n + offset) % variants.length] ?? ""
}

/** Gives the waiting items of a channel the variants in queue order,
    continuing the rotation after the posts already published. With
    `onlyPlain`, touches only items that still carry the default caption or
    none, so captions typed by hand stay. Returns how many changed. */
export async function distributeCaptionVariants(channel: QueueChannel, onlyPlain: boolean): Promise<number> {
  const [variants, settings, waiting, published] = await Promise.all([
    readCaptionVariants(),
    readQueueSettings(channel),
    listQueuedInOrder(channel),
    countPublished(channel),
  ])
  const plain = new Set(["", settings.defaultCaption.trim(), DEFAULT_QUEUE_CAPTION.trim()])
  let changed = 0
  for (const [index, item] of waiting.entries()) {
    if (onlyPlain && !plain.has(item.caption.trim())) continue
    const caption = pickVariant(variants, channel, published + index)
    if (caption && caption !== item.caption) {
      await setQueueCaption(item.id, caption)
      changed++
    }
  }
  return changed
}

/** One-time switch from one shared caption to rotating variants for files
    uploaded before variants existed. */
export async function applyCaptionVariantsOnce(): Promise<void> {
  if (await getSetting("caption_variants_applied")) return
  for (const channel of QUEUE_CHANNELS) await distributeCaptionVariants(channel, true)
  await setSetting("caption_variants_applied", new Date().toISOString())
}

/** Adds the given files to a channel's queue (the same stored file, no
    second upload), each with the next caption variant. Skips files the
    channel already has. Returns how many were added. */
export async function copyToChannel(
  channel: QueueChannel,
  files: Array<Pick<QueueItem, "kind" | "fileName" | "mediaUrl" | "mediaType" | "bytes" | "branding">>
): Promise<number> {
  const [known, variants, existing] = await Promise.all([
    channelMediaUrls(channel),
    readCaptionVariants(),
    countQueueItems(channel),
  ])
  const fresh = files.filter((file) => file.mediaUrl && !known.has(file.mediaUrl))
  if (fresh.length === 0) return 0
  await insertQueueItems(
    channel,
    fresh.map((file, index) => ({
      kind: file.kind,
      fileName: file.fileName,
      mediaUrl: file.mediaUrl!,
      mediaType: file.mediaType,
      bytes: file.bytes,
      caption: pickVariant(variants, channel, existing + index),
      branding: brandingSettled(file.branding) ? file.branding : null,
    }))
  )
  await rescheduleQueue(channel)
  return fresh.length
}

/** One-time: files uploaded to the Facebook queue before uploads went to
    both channels also join the Instagram queue. */
export async function mirrorFacebookBacklogOnce(): Promise<void> {
  if (await getSetting("mirror_fb_to_ig_done")) return
  await copyToChannel("ig", await listQueuedInOrder("fb"))
  await setSetting("mirror_fb_to_ig_done", new Date().toISOString())
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


/** "done" = badged, "skip" = no badge wanted (poster, or turned off). */
export function brandingSettled(branding: string | null): boolean {
  return branding === "done" || branding === "skip"
}

/** Puts the behero.ge badge on a queued video. Returns the item with its new
    file, or throws with the reason (also saved on the item). */
export async function brandQueueItem(item: QueueItem): Promise<QueueItem> {
  if (item.kind !== "video" || brandingSettled(item.branding) || !item.mediaUrl) return item
  try {
    const branded = await brandStoredVideo(item.mediaUrl, item.fileName)
    if (!branded) {
      await setQueueBrandingByUrl(item.mediaUrl, "skip")
      return { ...item, branding: "skip" }
    }
    await setQueueBranded(item.mediaUrl, branded.url, branded.bytes)
    return { ...item, mediaUrl: branded.url, bytes: branded.bytes, mediaType: "video/mp4", branding: "done" }
  } catch (caught) {
    const reason = `ლოგო ვერ დაედო: ${message(caught)}`.slice(0, 500)
    await setQueueBrandingError(item.id, reason)
    throw new Error(reason)
  }
}

/** One posting step for a queue item, to its channel only; deletes the file
    once posted when that setting is on. */
export async function advanceQueueItem(meta: MetaConfig, item: QueueItem): Promise<QueueStatus> {
  const settings = await readQueueSettings(item.channel)
  const continuing = item.status === "publishing"
  let media: string | null = null
  if (!continuing && item.kind === "video" && !brandingSettled(item.branding)) {
    try {
      item = await brandQueueItem(item)
    } catch (caught) {
      await saveQueuePublish(item.id, {
        status: "failed",
        fbPostId: item.fbPostId,
        igContainerId: item.igContainerId,
        igMediaId: item.igMediaId,
        error: message(caught),
      })
      return "failed"
    }
  }
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
    if ((await otherMediaRefs(item.mediaUrl, item.id)) === 0) await del(item.mediaUrl).catch(() => undefined)
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
  try {
    await applyCaptionVariantsOnce()
    if (meta.igUserId) await mirrorFacebookBacklogOnce()
  } catch (caught) {
    report.notes.push(`Queue setup: ${message(caught)}`)
  }
  for (const channel of QUEUE_CHANNELS) {
    if (channel === "ig" && !meta.igUserId) continue
    const part = await processChannel(meta, channel, now)
    report.published += part.published
    report.notes.push(...part.notes)
  }
  // Ahead of time: badge one more waiting video per pass, so posting
  // itself rarely has to wait for ffmpeg.
  const next = await nextUnbrandedVideo()
  if (next) {
    try {
      await brandQueueItem(next)
    } catch (caught) {
      report.notes.push(`Queue ${next.fileName}: ${message(caught)}`)
    }
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
