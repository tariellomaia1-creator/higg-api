"use server"

import { del } from "@vercel/blob"

import { parseBlocks } from "./blocks"
import {
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
  setQueuePosition,
  setQueueTargets,
  setSetting,
} from "./db"
import type { QueueItem } from "./db"
import { storageLimitBytes } from "./config"
import { metaConfig } from "./meta"
import { advanceQueueItem, readQueueSettings, rescheduleQueue } from "./queue"
import type { QueueSettings } from "./queue"
import { parseTimes } from "./queue-schedule"
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
  items: QueueItem[]
  settings: QueueSettings
  metaConnected: boolean
  instagramConnected: boolean
  lastTickAt: string | null
  storage: { queue: number; limit: number }
}

/** Waiting files without a caption get the default one. */
async function fillEmptyQueueCaptions(caption: string): Promise<void> {
  if (!caption) return
  for (const item of await listQueuedInOrder())
    if (!item.caption) await setQueueCaption(item.id, caption)
}

export async function getQueueView(): Promise<Result<QueueView>> {
  return guard(async () => {
    await fillEmptyQueueCaptions((await readQueueSettings()).defaultCaption)
    const meta = metaConfig()
    const [items, settings, lastTickAt, queueBytes] = await Promise.all([
      listQueue(),
      readQueueSettings(),
      getSetting("last_tick_at"),
      queueStorageBytes(),
    ])
    return {
      items,
      settings,
      metaConnected: Boolean(meta),
      instagramConnected: Boolean(meta?.igUserId),
      lastTickAt,
      storage: { queue: queueBytes, limit: storageLimitBytes() },
    }
  })
}

export async function addQueueFiles(
  files: Array<{ url: unknown; mediaType: unknown; bytes: unknown; fileName: unknown }>
): Promise<Result<number>> {
  return guard(async () => {
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
    const { defaultCaption } = await readQueueSettings()
    await insertQueueItems(rows.map((row) => ({ ...row, caption: defaultCaption })))
    await rescheduleQueue()
    return rows.length
  })
}

export async function saveQueueCaption(id: unknown, caption: unknown): Promise<Result<null>> {
  return guard(async () => {
    await setQueueCaption(asId(id), typeof caption === "string" ? caption.trim().slice(0, 2200) : "")
    return null
  })
}

export async function saveQueueTargets(id: unknown, facebook: unknown, instagram: unknown): Promise<Result<null>> {
  return guard(async () => {
    await setQueueTargets(asId(id), facebook === true, instagram === true)
    return null
  })
}

/** Moves a waiting item one place up or down and re-times the queue. */
export async function moveQueueItem(id: unknown, direction: unknown): Promise<Result<null>> {
  return guard(async () => {
    const waiting = await listQueuedInOrder()
    const index = waiting.findIndex((item) => item.id === id)
    const target = index + (direction === "up" ? -1 : 1)
    if (index < 0 || target < 0 || target >= waiting.length) return null
    const a = waiting[index]!
    const b = waiting[target]!
    await setQueuePosition(a.id, b.position)
    await setQueuePosition(b.id, a.position)
    await rescheduleQueue()
    return null
  })
}

export async function removeQueueItem(id: unknown): Promise<Result<null>> {
  return guard(async () => {
    const removed = await deleteQueueItem(asId(id))
    if (removed?.mediaUrl && isBlobUrl(removed.mediaUrl))
      await del(removed.mediaUrl).catch(() => undefined)
    await rescheduleQueue()
    return null
  })
}

/** Gives the waiting items captions in queue order from `---` blocks. */
export async function applyQueueCaptions(text: unknown, onlyEmpty: unknown): Promise<Result<number>> {
  return guard(async () => {
    const blocks = parseBlocks(typeof text === "string" ? text : "")
    const targets = (await listQueuedInOrder()).filter((item) => onlyEmpty !== true || !item.caption)
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

export async function saveQueueSettings(input: {
  enabled: unknown
  times: unknown
  deleteAfter: unknown
  defaultCaption?: unknown
}): Promise<Result<QueueSettings>> {
  return guard(async () => {
    const times = parseTimes(input.times)
    if (times.length === 0) throw new Error("ჩაწერე მინიმუმ ერთი საათი, მაგ. 10:00.")
    await setSetting("queue_enabled", input.enabled === false ? "off" : "on")
    await setSetting("queue_times", JSON.stringify(times))
    await setSetting("queue_delete_after", input.deleteAfter === false ? "off" : "on")
    if (typeof input.defaultCaption === "string") {
      const caption = input.defaultCaption.trim().slice(0, 2200)
      await setSetting("queue_default_caption", caption)
      await fillEmptyQueueCaptions(caption)
    }
    await rescheduleQueue()
    return readQueueSettings()
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
    const status = await advanceQueueItem(meta, item)
    await rescheduleQueue()
    return status
  })
}

export async function retryQueueItem(id: unknown): Promise<Result<null>> {
  return guard(async () => {
    await resetQueueItem(asId(id))
    await rescheduleQueue()
    return null
  })
}

/** Moves posts that are still processing (Instagram Reels) forward while
    the page is open. Starts nothing new. */
export async function refreshQueuePublishing(): Promise<Result<null>> {
  return guard(async () => {
    const meta = metaConfig()
    if (!meta) return null
    for (const item of await listQueuePublishing()) await advanceQueueItem(meta, item)
    return null
  })
}
