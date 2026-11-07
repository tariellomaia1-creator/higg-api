"use server"

import { del } from "@vercel/blob"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { blobConfigured } from "./blob"
import { buildCaption } from "./caption"
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  safeEqual,
  sessionToken,
  sitePassword,
} from "./auth"
import {
  addDays,
  isDay,
  parsePosterSettings,
  slotCount,
  storageLimitBytes,
  tbilisiNow,
} from "./config"
import type { PosterSettings } from "./config"
import type { ItemKind } from "./config"
import {
  clearSlot,
  deleteDayItems,
  getItem,
  fillCaption,
  getSetting,
  listUnposted,
  listWithoutCaption,
  updateCaption,
  setSetting,
  listDay,
  listDaysWithContent,
  listFinished,
  listRange,
  resetForRetry,
  resetPublish,
  storageUsedBytes,
  upsertPlan,
} from "./db"
import type { DailyItem } from "./db"
import { getKieBalance, kieApiKey } from "./kie"
import { metaConfig } from "./meta"
import {
  continuePublishing,
  generateItemNow,
  pollInFlight,
  publishItemNow,
  runTick,
} from "./pipeline"
import type { TickReport } from "./pipeline"
import { requireSession } from "./session"

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type SetupStatus = {
  database: boolean
  blob: boolean
  generator: boolean
  facebook: boolean
  instagram: boolean
  scheduler: boolean
}

export type DayView = {
  day: string
  today: string
  hour: number
  items: DailyItem[]
  storage: { used: number; limit: number }
  days: Array<{ day: string; bytes: number; count: number }>
}

async function guard<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    await requireSession()
    return { ok: true, data: await run() }
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : String(caught),
    }
  }
}

export async function login(
  _previous: { error: string } | null,
  form: FormData
): Promise<{ error: string } | null> {
  const expected = sitePassword()
  if (!expected)
    return {
      error:
        "SITE_PASSWORD is not set. Add it in Vercel → Settings → Environment Variables and redeploy.",
    }
  const given = form.get("password")
  if (typeof given !== "string" || !safeEqual(given.trim(), expected)) {
    // Slows down guessing a short password.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return { error: "პაროლი არასწორია." }
  }
  const jar = await cookies()
  jar.set(SESSION_COOKIE, await sessionToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
  redirect("/")
}

export async function logout(): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 })
  redirect("/login")
}

export async function getSetupStatus(): Promise<Result<SetupStatus>> {
  return guard(async () => {
    const meta = metaConfig()
    return {
      database: Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL),
      blob: blobConfigured(),
      generator: Boolean(process.env.KIE_API_KEY?.trim()),
      facebook: Boolean(meta),
      instagram: Boolean(meta?.igUserId),
      scheduler: Boolean(process.env.CRON_SECRET?.trim()),
    }
  })
}

/** Live kie.ai balance for the account behind KIE_API_KEY. */
export async function getCreditBalance(): Promise<Result<number>> {
  return guard(async () => {
    const key = kieApiKey()
    if (!key) throw new Error("KIE_API_KEY is not set.")
    return getKieBalance(key)
  })
}

export async function getDayView(day: unknown): Promise<Result<DayView>> {
  return guard(async () => {
    const now = tbilisiNow()
    const target = isDay(day) ? day : now.day
    const [items, used, days] = await Promise.all([
      listDay(target),
      storageUsedBytes(),
      listDaysWithContent(),
    ])
    return {
      day: target,
      today: now.day,
      hour: now.hour,
      items,
      storage: { used, limit: storageLimitBytes() },
      days,
    }
  })
}

function asKind(value: unknown): ItemKind {
  if (value === "video" || value === "poster") return value
  throw new Error("Invalid item kind.")
}

function isOwnBlobUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".blob.vercel-storage.com")
    )
  } catch {
    return false
  }
}

/** Which slots are already taken from `from` for `days` days, so a batch
    only fills free days. */
export async function getTakenSlots(
  from: unknown,
  days: unknown
): Promise<Result<Array<{ day: string; kind: ItemKind; slot: number }>>> {
  return guard(async () => {
    if (!isDay(from)) throw new Error("Invalid day.")
    const span = Math.min(Math.max(Number(days) || 1, 1), 400)
    const items = await listRange(from, addDays(from, span - 1))
    return items.map((item) => ({ day: item.day, kind: item.kind, slot: item.slot }))
  })
}

const POSTER_SETTINGS_KEY = "poster_settings"

export async function getPosterSettings(): Promise<Result<PosterSettings>> {
  return guard(async () => {
    const raw = await getSetting(POSTER_SETTINGS_KEY)
    try {
      return parsePosterSettings(raw ? JSON.parse(raw) : null)
    } catch {
      return parsePosterSettings(null)
    }
  })
}

export async function savePosterSettings(value: unknown): Promise<Result<PosterSettings>> {
  return guard(async () => {
    const settings = parsePosterSettings(value)
    await setSetting(POSTER_SETTINGS_KEY, JSON.stringify(settings))
    return settings
  })
}

const CAPTION_FOOTER_KEY = "caption_footer"
/** The footer already added to existing captions, so it is added only once
    and replaced (not stacked) when the footer changes. */
const APPLIED_FOOTER_KEY = "caption_footer_applied"
const DEFAULT_CAPTION_FOOTER = "სცადე უფასოდ 👉 behero.ge\n#მათემატიკა #BeHero"

async function currentFooter(): Promise<string> {
  return (await getSetting(CAPTION_FOOTER_KEY)) ?? DEFAULT_CAPTION_FOOTER
}

/** Fixed end of every auto caption: link, call to action, hashtags. */
export async function getCaptionFooter(): Promise<Result<string>> {
  return guard(async () => await currentFooter())
}

export async function saveCaptionFooter(value: unknown): Promise<Result<string>> {
  return guard(async () => {
    const footer = typeof value === "string" ? value.trim().slice(0, 1000) : ""
    await setSetting(CAPTION_FOOTER_KEY, footer)
    return footer
  })
}

/** Fills every empty caption of slots not yet posted from their prompt.
    Free: plain text, no AI call. Returns how many were filled. */
export async function fillMissingCaptions(): Promise<Result<number>> {
  return guard(async () => {
    const footer = await currentFooter()
    await applyFooterToExisting(footer)
    let filled = 0
    for (const item of await listWithoutCaption()) {
      const caption = buildCaption(item.prompt, footer)
      if (caption && (await fillCaption(item.id, caption))) filled++
    }
    return filled
  })
}

/** Puts the footer at the end of every caption not yet posted: once per
    footer text. A previously applied footer is swapped for the new one. */
async function applyFooterToExisting(footer: string): Promise<void> {
  const applied = await getSetting(APPLIED_FOOTER_KEY)
  if (applied === footer) return
  for (const item of await listUnposted()) {
    if (!item.caption) continue
    let body = item.caption
    if (applied && body.includes(applied)) body = body.replace(applied, "").trimEnd()
    if (footer && !body.includes(footer)) body = [body.trimEnd(), footer].filter(Boolean).join("\n\n")
    if (body !== item.caption) await updateCaption(item.id, body.slice(0, 2200))
  }
  await setSetting(APPLIED_FOOTER_KEY, footer)
}

export async function savePlanItem(input: {
  day: unknown
  kind: unknown
  slot: unknown
  prompt: unknown
  caption: unknown
  startImageUrl: unknown
  startImageBytes: unknown
}): Promise<Result<DailyItem>> {
  return guard(async () => {
    if (!isDay(input.day)) throw new Error("Invalid day.")
    const kind = asKind(input.kind)
    const slot = Number(input.slot)
    if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount(kind))
      throw new Error("Invalid slot.")
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : ""
    const typedCaption = typeof input.caption === "string" ? input.caption.trim() : ""
    // An empty caption is filled from the prompt's quoted Georgian text and
    // the saved footer; a caption the user wrote is kept as is.
    const caption =
      typedCaption ||
      buildCaption(
        typeof input.prompt === "string" ? input.prompt : "",
        await currentFooter()
      )
    if (prompt.length > 5000 || caption.length > 2200)
      throw new Error("ტექსტი ძალიან გრძელია (პრომტი ≤ 5000, caption ≤ 2200).")
    let startImageUrl: string | null = null
    let startImageBytes = 0
    if (kind === "video" && typeof input.startImageUrl === "string" && input.startImageUrl) {
      if (!isOwnBlobUrl(input.startImageUrl))
        throw new Error("Upload the start image again.")
      startImageUrl = input.startImageUrl
      startImageBytes = Math.max(0, Number(input.startImageBytes) || 0)
    }
    const { item, replacedUrls } = await upsertPlan({
      day: input.day,
      kind,
      slot,
      prompt,
      caption,
      startImageUrl,
      startImageBytes,
    })
    await removeBlobs(replacedUrls)
    return item
  })
}

export async function clearPlanItem(id: unknown): Promise<Result<null>> {
  return guard(async () => {
    if (typeof id !== "string") throw new Error("Invalid item.")
    const removed = await clearSlot(id)
    if (removed) await removeBlobs(blobUrls([removed]))
    return null
  })
}

export async function deleteDay(day: unknown): Promise<Result<number>> {
  return guard(async () => {
    if (!isDay(day)) throw new Error("Invalid day.")
    const removed = await deleteDayItems(day)
    await removeBlobs(blobUrls(removed))
    return removed.length
  })
}

export async function retryGeneration(id: unknown): Promise<Result<null>> {
  return guard(async () => {
    if (typeof id !== "string") throw new Error("Invalid item.")
    await resetForRetry(id)
    return null
  })
}

export async function retryPublish(id: unknown): Promise<Result<null>> {
  return guard(async () => {
    if (typeof id !== "string") throw new Error("Invalid item.")
    const item = await getItem(id)
    if (!item) throw new Error("Item not found.")
    await resetPublish(id)
    return null
  })
}

/** Checks running generations once (no new submissions). Called by the open
    planner so results appear without waiting for the cron. */
export async function refreshGenerating(): Promise<Result<number>> {
  return guard(async () => {
    const polled = await pollInFlight()
    await continuePublishing()
    return polled.completed
  })
}

/** Generates one planned slot now, even if its day is still ahead. */
export async function generateNow(id: unknown): Promise<Result<null>> {
  return guard(async () => {
    if (typeof id !== "string") throw new Error("Invalid item.")
    const item = await getItem(id)
    if (!item) throw new Error("Item not found.")
    await generateItemNow(item)
    return null
  })
}

/** Posts a finished slot to Facebook and Instagram now. */
export async function publishNow(id: unknown): Promise<Result<string>> {
  return guard(async () => {
    if (typeof id !== "string") throw new Error("Invalid item.")
    const item = await getItem(id)
    if (!item) throw new Error("Item not found.")
    return publishItemNow(item)
  })
}

/** Every finished video and poster, newest first. */
export async function getGallery(): Promise<Result<DailyItem[]>> {
  return guard(() => listFinished())
}

/** Runs one scheduler pass now. Unlike the cron, it starts today's planned
    slots immediately instead of waiting for 06:00. */
export async function runSchedulerNow(): Promise<Result<TickReport>> {
  return guard(() => runTick(new Date(), { startTodayNow: true }))
}

function blobUrls(items: DailyItem[]): string[] {
  return items.flatMap((item) =>
    [item.startImageUrl, item.resultUrl].filter(
      (url): url is string => typeof url === "string" && isOwnBlobUrl(url)
    )
  )
}

async function removeBlobs(urls: string[]): Promise<void> {
  const own = urls.filter(isOwnBlobUrl)
  if (own.length === 0 || !blobConfigured()) return
  try {
    await del(own)
  } catch (caught) {
    console.error("[daily] could not delete blobs", caught)
  }
}
