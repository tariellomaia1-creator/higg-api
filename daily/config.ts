/** Daily content plan: fixed counts, models and the Tbilisi publishing clock. */

export const VIDEOS_PER_DAY = 1
export const POSTERS_PER_DAY = 1

/** Generation starts at 06:00 Tbilisi so everything is ready by 08:00. */
export const GENERATE_FROM_HOUR = 6
/** First post at 08:00; one post per hour, video and poster alternating. */
export const PUBLISH_FROM_HOUR = 8

/** One original attempt plus one automatic retry. */
export const MAX_ATTEMPTS = 2

/** Tbilisi is UTC+4 all year (no daylight saving time). */
const TBILISI_OFFSET_MS = 4 * 60 * 60 * 1000

export type ItemKind = "video" | "poster"

export function tbilisiNow(now = new Date()): { day: string; hour: number } {
  const shifted = new Date(now.getTime() + TBILISI_OFFSET_MS)
  return {
    day: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
  }
}

export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

export function isDay(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  )
}

export function slotCount(kind: ItemKind): number {
  return kind === "video" ? VIDEOS_PER_DAY : POSTERS_PER_DAY
}

/** Video 1 at 08:00, poster 1 at 09:00, then alternating hourly if more slots are added. */
export function publishHour(kind: ItemKind, slot: number): number {
  return PUBLISH_FROM_HOUR + slot * 2 + (kind === "poster" ? 1 : 0)
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

/** Vercel Blob storage on the Hobby plan; overridable with BLOB_LIMIT_MB. */
export function storageLimitBytes(): number {
  const mb = Number(process.env.BLOB_LIMIT_MB)
  return (Number.isFinite(mb) && mb > 0 ? mb : 1000) * 1024 * 1024
}

/** Approximate charge per slot, shown before generating. Veo 3.1 Lite 720p
    is a flat price; GPT Image 2.6 Sunburst is billed by tokens, so this is a
    typical range for one 1K square image. https://kie.ai/veo-3-1 */
export const ESTIMATED_CREDITS = {
  video: { min: 30, max: 30 },
  poster: { min: 10, max: 60 },
} as const

/** kie.ai sells credits at about $0.005 each. */
export const USD_PER_CREDIT = 0.005

/** GPT Image 2.6 Sunburst rendering options on kie.ai. Higher quality draws
    text (Georgian letters included) more carefully and costs more tokens. */
export const POSTER_QUALITIES = ["medium", "high", "xhigh", "max"] as const
export type PosterQuality = (typeof POSTER_QUALITIES)[number]
export const POSTER_RESOLUTIONS = ["1K", "2K"] as const
export type PosterResolution = (typeof POSTER_RESOLUTIONS)[number]
export type PosterSettings = { quality: PosterQuality; resolution: PosterResolution }
export const DEFAULT_POSTER_SETTINGS: PosterSettings = { quality: "max", resolution: "1K" }

export function parsePosterSettings(value: unknown): PosterSettings {
  const data = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
  const quality = POSTER_QUALITIES.find((q) => q === data.quality) ?? DEFAULT_POSTER_SETTINGS.quality
  const resolution =
    POSTER_RESOLUTIONS.find((r) => r === data.resolution) ?? DEFAULT_POSTER_SETTINGS.resolution
  return { quality, resolution }
}
