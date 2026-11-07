import "server-only"

import { del } from "@vercel/blob"

import { isBlobUrl, readFile, storeFile } from "./blob-server"
import { buildCaption } from "./caption"
import sharp from "sharp"

import {
  GENERATE_FROM_HOUR,
  MAX_ATTEMPTS,
  parsePosterSettings,
  publishHour,
  slotCount,
  tbilisiNow,
} from "./config"
import {
  listGeneratable,
  listGenerating,
  getSetting,
  listPublishable,
  listPublishing,
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
  uploadToKie,
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
  const polled = await pollInFlight(apiKey)
  report.completed += polled.completed
  report.failed += polled.failed
  report.notes.push(...polled.notes)

  // 2. Start what is due: today's slots from 06:00 (or at once when run by
  //    hand from the planner), and yesterday's leftovers.
  // Slots beyond today's count (left from an earlier, larger plan) are ignored.
  // A scheduler call starts nothing unless automatic generation is switched
  // on; a hand-started run from the planner always may.
  const autoGenerate = (await getSetting("auto_generate")) === "on"
  const due = (await listGeneratable(day)).filter(
    (item) =>
      item.slot < slotCount(item.kind) &&
      (options.startTodayNow ||
        (autoGenerate && (item.day < day || hour >= GENERATE_FROM_HOUR)))
  )
  for (const item of due) {
    if (item.attempts >= MAX_ATTEMPTS) continue
    try {
      const task =
        item.kind === "video"
          ? veoLiteTask(item.prompt, await startImageForKie(apiKey, item))
          : gptSunburstTask(item.prompt, await posterSettings())
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
  // Scheduled posting is off unless switched on in the planner; posts that
  // were already started (above) and "publish now" are not affected.
  if ((await getSetting("auto_publish")) !== "on") {
    report.notes.push("Automatic publishing is off.")
    return report
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

/** Checks every running kie.ai task once and stores finished results. Never
    submits anything, so the planner can call it while it is open. */
async function posterSettings() {
  const raw = await getSetting("poster_settings")
  try {
    return parsePosterSettings(raw ? JSON.parse(raw) : null)
  } catch {
    return parsePosterSettings(null)
  }
}

/** Starts one planned slot now, whatever its day. */
export async function generateItemNow(item: DailyItem): Promise<void> {
  if (item.status !== "pending") throw new Error("ეს სლოტი უკვე გენერირდება ან მზადაა.")
  if (!item.prompt) throw new Error("ჯერ პრომტი დაწერე და შეინახე.")
  if (item.kind === "video" && !item.startImageUrl)
    throw new Error("ჯერ start image ატვირთე და შეინახე.")
  const apiKey = requireKieKey()
  const task =
    item.kind === "video"
      ? veoLiteTask(item.prompt, await startImageForKie(apiKey, item))
      : gptSunburstTask(item.prompt, await posterSettings())
  try {
    const taskId = await createKieTask(apiKey, task)
    await markSubmitted(item.id, taskId)
  } catch (caught) {
    if (caught instanceof KieError && caught.code in ACCOUNT_ERRORS)
      throw new Error(`${ACCOUNT_ERRORS[caught.code]!} („${caught.message}“)`)
    throw caught
  }
}

/** Posts one finished slot right away, ignoring its scheduled hour. */
export async function publishItemNow(item: DailyItem): Promise<PublishStatus> {
  const meta = metaConfig()
  if (!meta) throw new Error("Meta is not connected (META_PAGE_ID / META_PAGE_ACCESS_TOKEN).")
  if (item.status !== "ready" || !item.resultUrl)
    throw new Error("ჯერ მასალა უნდა დამზადდეს.")
  if (item.publishStatus === "published") throw new Error("უკვე გამოქვეყნებულია.")
  if (item.publishStatus === "publishing") throw new Error("უკვე ქვეყნდება.")
  return advancePublish(meta, { ...item, publishStatus: "waiting" })
}

/** Moves posts that are still processing (Instagram Reels) forward. Called
    by the open planner so their status updates without the scheduler. */
export async function continuePublishing(): Promise<number> {
  const meta = metaConfig()
  if (!meta) return 0
  let published = 0
  for (const item of await listPublishing())
    if ((await advancePublish(meta, item)) === "published") published++
  return published
}

export async function pollInFlight(
  apiKey = requireKieKey()
): Promise<Pick<TickReport, "completed" | "failed" | "notes">> {
  const report = { completed: 0, failed: 0, notes: [] as string[] }
  for (const item of await listGenerating()) {
    try {
      const task = await getKieTask(apiKey, item.requestId!)
      if (task.state === "success") {
        if (!task.url) throw new Error("Completed without a result URL.")
        // The result is paid for, so it is never regenerated. If copying it
        // into our storage fails, show kie.ai's own link (kept there for a
        // limited time) and say why, so it can be downloaded right away.
        let finished = false
        try {
          const stored = await storeResult(item, task.url)
          finished = await markReady(item.id, stored.url, stored.bytes)
          if (!finished) await del(stored.url).catch(() => undefined)
        } catch (caught) {
          const reason = `საცავში შენახვა ვერ მოხერხდა (${message(caught)}). ნაჩვენებია kie.ai-ის დროებითი ბმული: ჩამოტვირთე დღესვე.`
          finished = await markReady(item.id, task.url, 0)
          if (finished) await noteError(item.id, reason)
          report.notes.push(`${label(item)}: ${reason}`)
        }
        if (finished) {
          await addCreditsUsed(item.id, task.credits)
          report.completed++
        }
      } else if (task.state === "fail") {
        await addCreditsUsed(item.id, task.credits)
        // A safety refusal fails the same way every time, so it is not retried.
        const blocked = explainBlocked(item, task.reason)
        const final = blocked !== null || item.attempts >= MAX_ATTEMPTS
        await markAttemptFailed(item.id, blocked ?? task.reason, final)
        if (final) report.failed++
      }
    } catch (caught) {
      if (isTransient(caught) || (caught instanceof KieError && caught.code in ACCOUNT_ERRORS))
        report.notes.push(`${label(item)}: ${message(caught)}`)
      else {
        const final = item.attempts >= MAX_ATTEMPTS
        await markAttemptFailed(item.id, message(caught), final)
        if (final) report.failed++
      }
    }
  }
  return report
}

/** kie.ai passes on the model's safety refusals in English; say in Georgian
    what to change. Returns null for other failures (those are retried). */
function explainBlocked(item: DailyItem, reason: string): string | null {
  if (/unsafe image upload/i.test(reason))
    return `Google-ის უსაფრთხოების ფილტრმა start image დაბლოკა („${reason}“). ხშირი მიზეზები: არასრულწლოვნად აღქმული სახე, ცნობილი ადამიანი ან ზედმეტად რეალისტური ფოტო, გამომწვევი ჩაცმულობა. ატვირთე სხვა ფოტო (აშკარად ზრდასრული პერსონაჟი, ან ილუსტრაციის/3D სტილი) და დააჭირე „თავიდან გენერაცია“.`
  if (/flagged|content polic|violat/i.test(reason))
    return `${item.kind === "video" ? "ვიდეოს" : "პოსტერის"} პრომტი უსაფრთხოების ფილტრმა დაბლოკა („${reason}“). გადააკეთე პრომტი (ბრენდები, ცნობილი სახეები, ძალადობა, მგრძნობიარე სიტყვები) და დააჭირე „თავიდან გენერაცია“.`
  return null
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
    const url = await storeFile(`${name}.mp4`, raw, "video/mp4")
    return { url, bytes: raw.byteLength }
  }
  // Instagram only accepts JPEG images.
  const jpeg = await sharp(raw).jpeg({ quality: 92 }).toBuffer()
  const url = await storeFile(`${name}.jpg`, jpeg, "image/jpeg")
  return { url, bytes: jpeg.byteLength }
}

/** kie.ai must be able to download the start image. A file in our Blob store
    may be private, so it is copied to kie.ai's own (free, 24 h) storage. */
async function startImageForKie(apiKey: string, item: DailyItem): Promise<string> {
  const source = item.startImageUrl!
  if (!isBlobUrl(source)) return source
  const { bytes, contentType } = await readFile(source)
  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg"
  return uploadToKie(
    apiKey,
    bytes,
    contentType,
    `${item.day}-video-${item.slot + 1}.${extension}`
  )
}

/** Temporary public URL for a stored result, for Meta to download. */
async function publicCopy(item: DailyItem, url: string): Promise<string> {
  const key = kieApiKey()
  if (!key) throw new Error("KIE_API_KEY is not set.")
  const { bytes, contentType } = await readFile(url)
  return uploadToKie(
    key,
    bytes,
    contentType,
    `${item.day}-${item.kind}-${item.slot + 1}.${item.kind === "video" ? "mp4" : "jpg"}`
  )
}

/** Posts to the Facebook Page once, and walks the Instagram container from
    creation to publication across passes (Reels take a while to process). */
async function advancePublish(
  meta: MetaConfig,
  item: DailyItem
): Promise<PublishStatus> {
  const continuing = item.publishStatus === "publishing"
  const errors: string[] = continuing && item.publishError ? [item.publishError] : []
  // Meta downloads the file itself; a private Blob URL is not reachable, so a
  // new post gets a temporary public copy (kie.ai file storage, 24 h).
  let media = item.resultUrl!
  if (!continuing && isBlobUrl(media)) {
    try {
      media = await publicCopy(item, media)
    } catch (caught) {
      await updatePublish(item.id, {
        publishStatus: "failed",
        publishError: `ფაილის საჯარო ბმული ვერ შეიქმნა: ${message(caught)}`,
      })
      return "failed"
    }
  }
  // Old slots saved before auto captions get one now.
  const caption =
    item.caption ||
    buildCaption(
      item.prompt,
      (await getSetting("caption_footer")) ?? "სცადე უფასოდ 👉 behero.ge\n#მათემატიკა #BeHero"
    )
  let fbPostId = item.fbPostId
  let igContainerId = item.igContainerId
  let igMediaId = item.igMediaId
  let pending = false

  if (!fbPostId && !continuing) {
    try {
      fbPostId = await publishFacebook(meta, item.kind, media, caption)
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
            caption
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
