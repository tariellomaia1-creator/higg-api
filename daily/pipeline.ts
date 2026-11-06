import "server-only"

import { put } from "@vercel/blob"
import sharp from "sharp"

import {
  GENERATE_FROM_HOUR,
  MAX_ATTEMPTS,
  publishHour,
  slotCount,
  tbilisiNow,
} from "./config"
import {
  listGeneratable,
  listGenerating,
  listPublishable,
  markAttemptFailed,
  markReady,
  markSubmitFailed,
  markKeyRejected,
  markSubmitted,
  noteError,
  addCreditsUsed,
  updatePublish,
} from "./db"
import type { DailyItem, PublishStatus } from "./db"
import {
  KieError,
  createKieTask,
  getKieBalance,
  getKieTask,
  gptSunburstTask,
  kieApiKey,
  veoLiteTask,
} from "./kie"
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

function requireKieKey(): string {
  const key = kieApiKey()
  if (!key)
    throw new Error(
      "KIE_API_KEY is not set on the server. Add your kie.ai API key in Vercel → Settings → Environment Variables, then redeploy."
    )
  return key
}

function message(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught)
}

function label(item: DailyItem): string {
  return `${item.day} ${item.kind === "video" ? "ვიდეო" : "პოსტერი"} ${item.slot + 1}`
}

/** Account-level refusals: the slot is fine, so it keeps its retry and the
    pass stops submitting until the account is fixed. */
const ACCOUNT_ERRORS: Record<number, string> = {
  401: "kie.ai-მ API key არ მიიღო. Vercel-ში KIE_API_KEY შეამოწმე (kie.ai/api-key), შემდეგ Redeploy.",
  402: "kie.ai-ზე კრედიტი არ კმარა. შეავსე ბალანსი kie.ai-ზე და სლოტები თავისით გაგრძელდება.",
}

/** Busy or maintenance answers: try again on the next pass, no retry spent. */
function isTransient(caught: unknown): boolean {
  if (caught instanceof TypeError) return true
  if (!(caught instanceof KieError)) return false
  return caught.code === 429 || caught.code === 455 || caught.code >= 501
}

/** One scheduler pass: finish running generations, start due ones, then
    advance publishing. Safe to call as often as every few minutes. */
export async function runTick(
  now = new Date(),
  options: { startTodayNow?: boolean } = {}
): Promise<TickReport> {
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
  const apiKey = requireKieKey()

  // 1. Running generations.
  for (const item of await listGenerating()) {
    try {
      const task = await getKieTask(apiKey, item.requestId!)
      if (task.state !== "pending") await addCreditsUsed(item.id, task.credits)
      if (task.state === "success") {
        if (!task.url) throw new Error("Completed without a result URL.")
        // The result is paid for, so it is never regenerated. If copying it
        // into our storage fails, show kie.ai's own link (kept there for a
        // limited time) and say why, so it can be downloaded right away.
        try {
          const stored = await storeResult(item, task.url)
          await markReady(item.id, stored.url, stored.bytes)
        } catch (caught) {
          const reason = `საცავში შენახვა ვერ მოხერხდა (${message(caught)}). ნაჩვენებია kie.ai-ის დროებითი ბმული: ჩამოტვირთე დღესვე.`
          await markReady(item.id, task.url, 0)
          await noteError(item.id, reason)
          report.notes.push(`${label(item)}: ${reason}`)
        }
        report.completed++
      } else if (task.state === "fail") {
        await failAttempt(item, task.reason, report)
      }
    } catch (caught) {
      if (isTransient(caught) || caught instanceof KieError && caught.code in ACCOUNT_ERRORS)
        report.notes.push(`${label(item)}: ${message(caught)}`)
      else await failAttempt(item, message(caught), report)
    }
  }

  // 2. Start what is due: today's slots from 06:00 (or at once when run by
  //    hand from the planner), and yesterday's leftovers.
  // Slots beyond today's count (left from an earlier, larger plan) are ignored.
  const due = (await listGeneratable(day)).filter(
    (item) =>
      item.slot < slotCount(item.kind) &&
      (item.day < day || hour >= GENERATE_FROM_HOUR || options.startTodayNow)
  )
  for (const item of due) {
    if (item.attempts >= MAX_ATTEMPTS) continue
    const task =
      item.kind === "video"
        ? veoLiteTask(item.prompt, item.startImageUrl!)
        : gptSunburstTask(item.prompt)
    try {
      const taskId = await createKieTask(apiKey, task)
      await markSubmitted(item.id, taskId)
      report.submitted++
    } catch (caught) {
      if (caught instanceof KieError && caught.code in ACCOUNT_ERRORS) {
        const balance = await getKieBalance(apiKey).catch(() => null)
        const reason = `${ACCOUNT_ERRORS[caught.code]!} kie.ai-ის პასუხი: „${caught.message}“.${
          balance === null ? "" : ` ამ გასაღების ანგარიშზე ბალანსი: ${balance} კრედიტი.`
        }`
        for (const pending of due) await markKeyRejected(pending.id, reason)
        report.notes.push(reason)
        break
      }
      if (isTransient(caught)) {
        report.notes.push(`${label(item)}: ${message(caught)}`)
        continue
      }
      const final = item.attempts + 1 >= MAX_ATTEMPTS
      await markSubmitFailed(item.id, message(caught), final)
      if (final) report.failed++
    }
  }

  // 3. Publishing.
  const meta = metaConfig()
  if (!meta) {
    report.notes.push("Meta is not connected; publishing skipped.")
    return report
  }
  const publishable = (await listPublishable(day)).filter(
    (item) => item.slot < slotCount(item.kind)
  )
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
