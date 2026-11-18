"use server"

import { del } from "@vercel/blob"

import { parseBlocks } from "./blocks"
import { formatVariants } from "./caption-variants"
import {
  countQueueItems,
  deleteQueueItem,
  getQueueItem,
  getSetting,
  insertQueueItems,
  listQueue,
  listQueuedInOrder,
  listQueuePublishing,
  queueStorageBytes,
  resetQueueItem,
  setQueueCaption,
  otherMediaRefs,
  setQueueBrandingByUrl,
  setQueueBrandingError,
  setQueuePosition,
  setSetting,
} from "./db"
import type { QueueChannel, QueueItem } from "./db"
import { storageLimitBytes } from "./config"
import { metaConfig } from "./meta"
import {
  QUEUE_CHANNELS,
  advanceQueueItem,
  applyCaptionVariantsOnce,
  asChannel,
  copyToChannel,
  mirrorFacebookBacklogOnce,
  distributeCaptionVariants,
  pickVariant,
  readCaptionVariants,
  saveCaptionVariants,
  queueSettingKey,
  readQueueSettings,
  rescheduleQueue,
} from "./queue"
import type { QueueSettings } from "./queue"
import { parseSlotKinds, parseTimes } from "./queue-schedule"
import { requireSession } from "./session"

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function guard<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    await requireSession()
    return { ok: true, data: await run() }
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : String(caught) }
  }
}

function isBlobUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com")
  } catch {
    return false
  }
}

function asId(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Invalid item.")
  return value
}

export type QueueView = {
  channel: QueueChannel
  items: QueueItem[]
  settings: QueueSettings
  metaConnected: boolean
  instagramConnected: boolean
  lastTickAt: string | null
  /** Caption rewordings, `---`-separated, shared by both channels. */
  captionVariants: string
  storage: { queue: number; limit: number }
}

/** Waiting files without a caption get the default one. */
async function fillEmptyQueueCaptions(channel: QueueChannel, caption: string): Promise<void> {
  if (!caption) return
  for (const item of await listQueuedInOrder(channel))
    if (!item.caption) await setQueueCaption(item.id, caption)
}

export async function getQueueView(channelInput: unknown): Promise<Result<QueueView>> {
  return guard(async () => {
    const channel = asChannel(channelInput)
    await applyCaptionVariantsOnce()
    if (metaConfig()?.igUserId) await mirrorFacebookBacklogOnce()
    await fillEmptyQueueCaptions(channel, (await readQueueSettings(channel)).defaultCaption)
    const meta = metaConfig()
    const [items, settings, lastTickAt, queueBytes, variants] = await Promise.all([
      listQueue(channel),
      readQueueSettings(channel),
      getSetting("last_tick_at"),
      queueStorageBytes(),
      readCaptionVariants(),
    ])
    return {
      channel,
      items,
      settings,
      metaConnected: Boolean(meta),
      instagramConnected: Boolean(meta?.igUserId),
      lastTickAt,
      captionVariants: formatVariants(variants),
      storage: { queue: queueBytes, limit: storageLimitBytes() },
    }
  })
}

/** Adds uploaded files to a channel's queue and, with `alsoOther`, to the
    other channel's queue too (same stored file, own caption and times). */
export async function addQueueFiles(
  channelInput: unknown,
  files: Array<{ url: unknown; mediaType: unknown; bytes: unknown; fileName: unknown }>,
  alsoOther?: unknown
): Promise<Result<number>> {
  return guard(async () => {
    const channel = asChannel(channelInput)
    if (!Array.isArray(files) || files.length === 0) throw new Error("No files.")
    const rows = files.map((file) => {
      if (typeof file.url !== "string" || !isBlobUrl(file.url)) throw new Error("Upload the file again.")
      const mediaType = typeof file.mediaType === "string" ? file.mediaType : ""
      return {
        kind: mediaType.startsWith("video/") ? ("video" as const) : ("image" as const),
        fileName: typeof file.fileName === "string" ? file.fileName.slice(0, 200) : "",
        mediaUrl: file.url,
        mediaType,
        bytes: Math.max(0, Number(file.bytes) || 0),
        caption: "",
      }
    })
    const [variants, existing] = await Promise.all([readCaptionVariants(), countQueueItems(channel)])
    await insertQueueItems(
      channel,
      rows.map((row, index) => ({ ...row, caption: pickVariant(variants, channel, existing + index) }))
    )
    await rescheduleQueue(channel)
    if (alsoOther === true)
      await copyToChannel(
        channel === "fb" ? "ig" : "fb",
        rows.map((row) => ({ ...row, branding: null }))
      )
    return rows.length
  })
}

export async function saveQueueCaption(id: unknown, caption: unknown): Promise<Result<null>> {
  return guard(async () => {
    await setQueueCaption(asId(id), typeof caption === "string" ? caption.trim().slice(0, 2200) : "")
    return null
  })
}

/** Moves a waiting item one place up or down and re-times the queue. */
export async function moveQueueItem(id: unknown, direction: unknown): Promise<Result<null>> {
  return guard(async () => {
    const item = await getQueueItem(asId(id))
    if (!item) return null
    const waiting = await listQueuedInOrder(item.channel)
    const index = waiting.findIndex((item) => item.id === id)
    const target = index + (direction === "up" ? -1 : 1)
    if (index < 0 || target < 0 || target >= waiting.length) return null
    const a = waiting[index]!
    const b = waiting[target]!
    await setQueuePosition(a.id, b.position)
    await setQueuePosition(b.id, a.position)
    await rescheduleQueue(item.channel)
    return null
  })
}

export async function removeQueueItem(id: unknown): Promise<Result<null>> {
  return guard(async () => {
    const removed = await deleteQueueItem(asId(id))
    if (removed?.mediaUrl && isBlobUrl(removed.mediaUrl) && (await otherMediaRefs(removed.mediaUrl, removed.id)) === 0)
      await del(removed.mediaUrl).catch(() => undefined)
    if (removed) await rescheduleQueue(removed.channel)
    return null
  })
}

/** Gives the waiting items captions in queue order from `---` blocks. */
export async function applyQueueCaptions(
  channelInput: unknown,
  text: unknown,
  onlyEmpty: unknown
): Promise<Result<number>> {
  return guard(async () => {
    const blocks = parseBlocks(typeof text === "string" ? text : "")
    const targets = (await listQueuedInOrder(asChannel(channelInput))).filter((item) => onlyEmpty !== true || !item.caption)
    let applied = 0
    for (const [index, item] of targets.entries()) {
      const caption = blocks[index]
      if (!caption) break
      await setQueueCaption(item.id, caption.slice(0, 2200))
      applied++
    }
    return applied
  })
}

export async function saveQueueSettings(channelInput: unknown, input: {
  enabled: unknown
  times: unknown
  deleteAfter: unknown
  defaultCaption?: unknown
  slotKinds?: unknown
}): Promise<Result<QueueSettings>> {
  return guard(async () => {
    const times = parseTimes(input.times)
    if (times.length === 0) throw new Error("ჩაწერე მინიმუმ ერთი საათი, მაგ. 10:00.")
    const channel = asChannel(channelInput)
    const key = (name: string) => queueSettingKey(channel, name)
    await setSetting(key("enabled"), input.enabled === false ? "off" : "on")
    await setSetting(key("times"), JSON.stringify(times))
    await setSetting(key("delete_after"), input.deleteAfter === false ? "off" : "on")
    if (input.slotKinds !== undefined)
      await setSetting(key("slot_kinds"), JSON.stringify(parseSlotKinds(input.slotKinds)))
    if (typeof input.defaultCaption === "string") {
      const caption = input.defaultCaption.trim().slice(0, 2200)
      await setSetting(key("default_caption"), caption)
      await fillEmptyQueueCaptions(channel, caption)
    }
    await rescheduleQueue(channel)
    return readQueueSettings(channel)
  })
}

/** Posts one item now, ahead of its time. */
export async function publishQueueItemNow(id: unknown): Promise<Result<string>> {
  return guard(async () => {
    const meta = metaConfig()
    if (!meta) throw new Error("Meta is not connected (META_PAGE_ID / META_PAGE_ACCESS_TOKEN).")
    const item = await getQueueItem(asId(id))
    if (!item) throw new Error("Item not found.")
    if (item.status !== "queued") throw new Error("ეს უკვე ქვეყნდება ან გამოქვეყნებულია.")
    if (item.channel === "ig" && !meta.igUserId) throw new Error("Instagram არ არის დაკავშირებული (META_IG_USER_ID).")
    const status = await advanceQueueItem(meta, item)
    await rescheduleQueue(item.channel)
    return status
  })
}

export async function retryQueueItem(id: unknown): Promise<Result<null>> {
  return guard(async () => {
    const item = await getQueueItem(asId(id))
    if (!item) return null
    await resetQueueItem(item.id)
    if (item.branding && item.branding !== "done" && item.branding !== "skip") await setQueueBrandingError(item.id, null)
    await rescheduleQueue(item.channel)
    return null
  })
}

/** Moves posts that are still processing (Instagram Reels) forward while
    the page is open. Starts nothing new. */
export async function refreshQueuePublishing(): Promise<Result<null>> {
  return guard(async () => {
    const meta = metaConfig()
    if (!meta) return null
    for (const channel of QUEUE_CHANNELS)
      for (const item of await listQueuePublishing(channel)) await advanceQueueItem(meta, item)
    return null
  })
}

/** Saves the caption rewordings (shared by both channels). */
export async function saveQueueCaptionVariants(text: unknown): Promise<Result<number>> {
  return guard(async () => (await saveCaptionVariants(typeof text === "string" ? text : "")).length)
}

/** Gives the waiting files of a channel different captions from the list,
    in queue order. `onlyPlain` keeps captions typed by hand. */
export async function redistributeQueueCaptions(channelInput: unknown, onlyPlain: unknown): Promise<Result<number>> {
  return guard(() => distributeCaptionVariants(asChannel(channelInput), onlyPlain === true))
}

/** Turns the behero.ge badge off or back on for a video not yet badged
    (both channels' copies of the file follow). */
export async function setQueueItemBadge(id: unknown, wanted: unknown): Promise<Result<null>> {
  return guard(async () => {
    const item = await getQueueItem(asId(id))
    if (!item?.mediaUrl || item.kind !== "video") return null
    if (item.branding === "done") throw new Error("ლოგო უკვე დადებულია; მოსახსნელად ვიდეო თავიდან ატვირთე.")
    await setQueueBrandingByUrl(item.mediaUrl, wanted === true ? null : "skip")
    return null
  })
}
