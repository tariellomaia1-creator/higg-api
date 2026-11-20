import "server-only"

import { spawn } from "node:child_process"
import { access, chmod, copyFile, mkdtemp, readFile as readLocal, readdir, rm, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { readFile, storeFile } from "./blob-server"

/** Puts the "behero.ge" badge (daily/assets/watermark.png) on a video:
    centred horizontally, near the bottom, 42% of the video width. Re-encodes
    the picture with ffmpeg; the sound is copied unchanged. */

/** Larger files would not fit the function's memory and time. */
export const BRAND_MAX_BYTES = 250 * 1024 * 1024

const WATERMARK = path.join(process.cwd(), "daily", "assets", "watermark.png")

const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  path.join(process.cwd(), "node_modules", "@ffmpeg-installer", "linux-x64", "ffmpeg"),
].filter((entry): entry is string => Boolean(entry))

let ffmpegPath: Promise<string> | null = null

/** pnpm keeps the package under node_modules/.pnpm, and the deployment may
    carry only that copy. */
async function pnpmCandidates(): Promise<string[]> {
  const store = path.join(process.cwd(), "node_modules", ".pnpm")
  try {
    return (await readdir(store))
      .filter((name) => name.startsWith("@ffmpeg-installer+linux-x64@"))
      .map((name) => path.join(store, name, "node_modules", "@ffmpeg-installer", "linux-x64", "ffmpeg"))
  } catch {
    return []
  }
}

/** The bundled ffmpeg binary, copied to /tmp with the execute bit when the
    deployment lost it. */
async function findFfmpeg(): Promise<string> {
  for (const candidate of [...FFMPEG_CANDIDATES, ...(await pnpmCandidates()), "/usr/bin/ffmpeg"]) {
    try {
      await access(candidate, constants.F_OK)
    } catch {
      continue
    }
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      const copy = path.join(tmpdir(), "behero-ffmpeg")
      await copyFile(candidate, copy)
      await chmod(copy, 0o755)
      return copy
    }
  }
  throw new Error("ffmpeg ვერ მოიძებნა სერვერზე.")
}

/** Runs ffmpeg; resolves with its log. `probe` runs only read the input
    (ffmpeg then exits non-zero by design). */
function run(binary: string, args: string[], probe = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] })
    let log = ""
    child.stderr.on("data", (chunk: Buffer) => {
      log = (log + chunk.toString()).slice(-20000)
    })
    child.on("error", reject)
    child.on("close", (code) =>
      code === 0 || probe
        ? resolve(log)
        : reject(new Error(`ffmpeg შეცდომა (${code}): ${log.split("\n").slice(-4).join(" ")}`))
    )
  })
}

/** Displayed width and height of the first video stream, with phone
    rotation applied; null when ffmpeg cannot tell. */
export function parseVideoSize(log: string): { width: number; height: number } | null {
  const line = log.split("\n").find((entry) => /Stream #\S+.*Video:/.test(entry))
  const match = line ? /\b(\d{2,5})x(\d{2,5})\b/.exec(line) : null
  if (!match) return null
  let width = Number(match[1])
  let height = Number(match[2])
  const rotation = /rotate\s*:\s*(-?\d+)|rotation of (-?[\d.]+)/.exec(log)
  const degrees = Math.abs(Number(rotation?.[1] ?? rotation?.[2] ?? 0)) % 180
  if (degrees === 90) [width, height] = [height, width]
  return { width, height }
}

/** Only vertical videos (Reels, 9:16) get the badge; square or 4:5 videos
    are posters and stay as they are. */
export function isVerticalVideo(size: { width: number; height: number } | null): boolean {
  return size !== null && size.height / size.width >= 1.5
}

/** Badge position: horizontally centred, bottom edge 17% above the frame's
    bottom so Reels/Facebook captions do not cover it. */
const FILTER =
  "[1:v][0:v]scale2ref=w=main_w*0.42:h=ow*0.22[wm][base];" +
  "[base][wm]overlay=x=(main_w-overlay_w)/2:y=main_h-overlay_h-main_h*0.17:format=auto,format=yuv420p[out]"

/** Burns the badge into the video bytes and returns the new MP4, or null
    when the video is not vertical (a poster) and needs no badge. */
export async function brandVideoBytes(input: Buffer): Promise<Buffer | null> {
  ffmpegPath ??= findFfmpeg().catch((error: unknown) => {
    ffmpegPath = null
    throw error
  })
  const binary = await ffmpegPath
  const dir = await mkdtemp(path.join(tmpdir(), "brand-"))
  try {
    const source = path.join(dir, "in")
    const target = path.join(dir, "out.mp4")
    await writeFile(source, input)
    if (!isVerticalVideo(parseVideoSize(await run(binary, ["-hide_banner", "-i", source], true)))) return null
    await run(binary, [
      "-hide_banner",
      "-y",
      "-i",
      source,
      "-i",
      WATERMARK,
      "-filter_complex",
      FILTER,
      "-map",
      "[out]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      target,
    ])
    return await readLocal(target)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Brands a stored video: writes the branded copy to storage and returns
    its URL and size (the caller deletes the original once no queue uses
    it); null for a poster (not vertical), which stays untouched. */
export async function brandStoredVideo(
  url: string,
  fileName: string
): Promise<{ url: string; bytes: number } | null> {
  const { bytes } = await readFile(url)
  if (bytes.length > BRAND_MAX_BYTES) throw new Error("ფაილი ძალიან დიდია ლოგოს დასადებად (მაქს. 250 MB).")
  const branded = await brandVideoBytes(bytes)
  if (!branded) return null
  const base = (fileName || "video").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").slice(-60) || "video"
  const stored = await storeFile(`daily/queue/branded/${base}.mp4`, branded, "video/mp4")
  return { url: stored, bytes: branded.length }
}
