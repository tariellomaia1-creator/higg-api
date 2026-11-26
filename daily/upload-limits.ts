/** What may be uploaded where: start images for daily slots, finished
    videos and images for the auto-posting queue. */
const START_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
const START_IMAGE_MAX_BYTES = 20 * 1024 * 1024
const QUEUE_TYPES = ["video/mp4", "video/quicktime", "image/jpeg", "image/png", "image/webp"]
const QUEUE_MAX_BYTES = 1024 * 1024 * 1024

export function limitsFor(pathname: string): { types: string[]; maxBytes: number } {
  if (pathname.startsWith("daily/start/")) return { types: START_IMAGE_TYPES, maxBytes: START_IMAGE_MAX_BYTES }
  if (pathname.startsWith("daily/queue/")) return { types: QUEUE_TYPES, maxBytes: QUEUE_MAX_BYTES }
  throw new Error("Invalid upload path.")
}
