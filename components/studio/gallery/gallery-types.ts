/** Data model for the justified-masonry feed. width/height only need the right ratio. */
export type MediaKind = "image" | "video"
export type ItemStatus = "ready" | "generating" | "failed"

export interface GalleryItem {
  id: string
  /** Run this item belongs to (one video, or one of N images). */
  runId: string
  projectId?: string
  createdAt: number
  kind: MediaKind
  status: ItemStatus
  /** Still for images; poster (may be empty) for video. */
  src: string
  videoSrc?: string
  width: number
  height: number
  failureLabel?: string
  prompt: string
  alt: string
  modelLabel: string
  settings: Record<string, unknown>
  groupId: string
  groupLabel: string
}

/** How near a tile is to the viewport — drives eager vs lazy loading. */
export type LoadTier = "full" | "near" | "far"
