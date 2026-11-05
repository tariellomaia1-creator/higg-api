import "server-only"

import { put } from "@vercel/blob"
import sharp from "sharp"

import { PlatformError, createPlatformClient } from "@/generation/platform"

import {
  GENERATE_FROM_HOUR,
  MAX_ATTEMPTS,
  posterInput,
  posterModelPath,
  publishHour,
  tbilisiNow,
  videoInput,
  videoModelPath,
} from "./config"
import {
  listGeneratable,
  listGenerating,
  listPublishable,
  markAttemptFailed,
  markReady,
  markSubmitFailed,
  markSubmitted,
  updatePublish,
} from "./db"
import type { DailyItem, PublishStatus } from "./db"
import {
  createInstagramContainer,
  instagramContainerStatus,
  metaConfig,
  publishFacebook,
  publishInstagramContainer,
} from "./meta"
import type { MetaConfig } from "./meta"

export type TickReport = {
  day: string
  hour: number
  submitted: number
  completed: number
  failed: number
  published: number
  notes: string[]
}

function platform() {
  const apiKey = process.env.HF_API_KEY?.trim()
  if (!apiKey)
    throw new Error(
      "HF_API_KEY is not set on the server. Add your Higgsfield API key in Vercel → Settings → Environment Variables."
    )
  return createPlatformClient({
    apiKey,
    baseUrl: process.env.HF_API_BASE_URL?.trim() || "https://platform.higgsfield.ai",
  })
}

function message(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught)
}

function label(item: DailyItem): string {
  return `${item.day} ${item.kind === "video" ? "ვიდეო" : "პოსტერი"} ${item.slot + 1}`
}

const FAILED_STATES: Record<string, string> = {
  failed: "გენერაცია ვერ მოხერხდა პლატფორმაზე.",
  nsfw: "კონტენტის ფილტრმა დაბლოკა (nsfw). შეცვალე პრომტი ან სურათი.",
  canceled: "მოთხოვნა გაუქმდა.",
}

/** One scheduler pass: finish running generations, start due ones, then
    advance publishing. Safe to call as often as every few minutes. */
export async function runTick(now = new Date()): Promise<TickReport> {
  const { day, hour } = tbilisiNow(now)
  const report: TickReport = {
    day,
    hour,
    submitted: 0,
    completed: 0,
    failed: 0,
    published: 0,
    notes: [],
  }
  const client = platform()

  // 1. Running generations.
  for (const item of await listGenerating()) {
    try {
      const status = await client.status(item.requestId!)
      if (status.status === "completed") {
        const source =
          item.kind === "video" ? status.video?.url : status.images?.[0]?.url
        if (!source) throw new Error("Completed without a result URL.")
        const stored = await storeResult(item, source)
        await markReady(item.id, stored.url, stored.bytes)
        report.completed++
      } else if (status.status in FAILED_STATES) {
        await failAttempt(item, FAILED_STATES[status.status]!, report)
      }
    } catch (caught) {
      // A lost request (404) or a broken result is a failed attempt; network
      // trouble and 5xx are asked again on the next pass.
      const transient =
        caught instanceof PlatformError ? caught.status >= 500 : false
      if (transient || isNetworkError(caught))
        report.notes.push(`${label(item)}: ${message(caught)}`)
      else await failAttempt(item, message(caught), report)
    }
  }

  // 2. Start what is due: today's slots from 06:00, and yesterday's leftovers.
  const due = (await listGeneratable(day)).filter(
    (item) => item.day < day || hour >= GENERATE_FROM_HOUR
  )
  for (const item of due) {
    if (item.attempts >= MAX_ATTEMPTS) continue
    const path = item.kind === "video" ? videoModelPath() : posterModelPath()
    const input =
      item.kind === "video"
        ? videoInput(item.prompt, item.startImageUrl!)
        : posterInput(item.prompt)
    try {
      const queued = await client.submit(
        path,
        input,
        `${item.id}-${item.attempts + 1}`
      )
      await markSubmitted(item.id, queued.requestId)
      report.submitted++
    } catch (caught) {
      const final = item.attempts + 1 >= MAX_ATTEMPTS
      await markSubmitFailed(item.id, submitError(caught, path), final)
      if (final) report.failed++
    }
  }

  // 3. Publishing.
  const meta = metaConfig()
  if (!meta) {
    report.notes.push("Meta is not connected; publishing skipped.")
    return report
  }
  const publishable = await listPublishable(day)
  for (const item of publishable.filter((i) => i.publishStatus === "publishing")) {
    if ((await advancePublish(meta, item)) === "published") report.published++
  }
  // At most one new post per pass keeps posts at least one pass apart even
  // when the scheduler catches up after an outage.
  const next = publishable
    .filter(
      (item) =>
        item.publishStatus === "waiting" && publishHour(item.kind, item.slot) <= hour
    )
    .sort(
      (a, b) => publishHour(a.kind, a.slot) - publishHour(b.kind, b.slot)
    )[0]
  if (next && (await advancePublish(meta, next)) === "published")
    report.published++
  return report
}

async function failAttempt(item: DailyItem, reason: string, report: TickReport) {
  const final = item.attempts >= MAX_ATTEMPTS
  await markAttemptFailed(item.id, reason, final)
  if (final) report.failed++
}

function submitError(caught: unknown, path: string): string {
  if (caught instanceof PlatformError && caught.status === 404)
    return `მოდელი ვერ მოიძებნა (${path}). შეამოწმე HF_VIDEO_MODEL_PATH / HF_POSTER_MODEL_PATH.`
  if (caught instanceof PlatformError && caught.status === 403)
    return "Higgsfield-ზე კრედიტი არ კმარა ან წვდომა აკრძალულია."
  return message(caught)
}

function isNetworkError(caught: unknown): boolean {
  return caught instanceof TypeError
}

async function storeResult(
  item: DailyItem,
  sourceUrl: string
): Promise<{ url: string; bytes: number }> {
  const response = await fetch(sourceUrl, { cache: "no-store" })
  if (!response.ok)
    throw new Error(`Could not download the result (${response.status}).`)
  const raw = Buffer.from(await response.arrayBuffer())
  const name = `daily/${item.day}/${item.kind}-${item.slot + 1}`
  if (item.kind === "video") {
    const blob = await put(`${name}.mp4`, raw, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: true,
    })
    return { url: blob.url, bytes: raw.byteLength }
  }
  // Instagram only accepts JPEG images.
  const jpeg = await sharp(raw).jpeg({ quality: 92 }).toBuffer()
  const blob = await put(`${name}.jpg`, jpeg, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: true,
  })
  return { url: blob.url, bytes: jpeg.byteLength }
}

/** Posts to the Facebook Page once, and walks the Instagram container from
    creation to publication across passes (Reels take a while to process). */
async function advancePublish(
  meta: MetaConfig,
  item: DailyItem
): Promise<PublishStatus> {
  const continuing = item.publishStatus === "publishing"
  const errors: string[] = continuing && item.publishError ? [item.publishError] : []
  const media = item.resultUrl!
  let fbPostId = item.fbPostId
  let igContainerId = item.igContainerId
  let igMediaId = item.igMediaId
  let pending = false

  if (!fbPostId && !continuing) {
    try {
      fbPostId = await publishFacebook(meta, item.kind, media, item.caption)
    } catch (caught) {
      errors.push(`Facebook: ${message(caught)}`)
    }
  }

  if (meta.igUserId && !igMediaId) {
    try {
      if (!igContainerId) {
        if (!continuing)
          igContainerId = await createInstagramContainer(
            meta,
            item.kind,
            media,
            item.caption
          )
      }
      if (igContainerId) {
        const state = await instagramContainerStatus(meta, igContainerId)
        if (state === "FINISHED")
          igMediaId = await publishInstagramContainer(meta, igContainerId)
        else if (state === "ERROR" || state === "EXPIRED")
          errors.push(`Instagram: მედია ვერ დამუშავდა (${state}).`)
        else pending = true
      }
    } catch (caught) {
      errors.push(`Instagram: ${message(caught)}`)
    }
  }

  const status: PublishStatus = pending
    ? "publishing"
    : errors.length === 0
      ? "published"
      : fbPostId || igMediaId
        ? "partial"
        : "failed"
  await updatePublish(item.id, {
    publishStatus: status,
    fbPostId,
    igContainerId,
    igMediaId,
    publishError: errors.length ? errors.join(" · ") : null,
    published: status === "published" || status === "partial",
  })
  return status
}
