import "server-only"

import type { PublishStatus } from "./db"
import {
  createInstagramContainer,
  instagramContainerStatus,
  publishFacebook,
  publishInstagramContainer,
} from "./meta"
import type { MetaConfig } from "./meta"

export type MetaPostState = {
  fbPostId: string | null
  igContainerId: string | null
  igMediaId: string | null
}

export type MetaPostOutcome = MetaPostState & {
  status: PublishStatus
  error: string | null
}

function message(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught)
}

/** One step of posting to the Facebook Page and Instagram. A new post sends
    the media to Facebook once and creates an Instagram container; later
    calls (continuing) only walk that container to publication, because
    Reels take a while to process. Shared by daily slots and the queue. */
export async function postToMeta(
  meta: MetaConfig,
  input: {
    kind: "video" | "poster"
    /** Public URL Meta can download; only needed for a new post. */
    mediaUrl: string | null
    caption: string
    state: MetaPostState
    continuing: boolean
    previousError: string | null
    targets: { facebook: boolean; instagram: boolean }
  }
): Promise<MetaPostOutcome> {
  const errors: string[] = input.continuing && input.previousError ? [input.previousError] : []
  let { fbPostId, igContainerId, igMediaId } = input.state
  let pending = false
  const media = input.mediaUrl

  if (input.targets.facebook && !fbPostId && !input.continuing && media) {
    try {
      fbPostId = await publishFacebook(meta, input.kind, media, input.caption)
    } catch (caught) {
      errors.push(`Facebook: ${message(caught)}`)
    }
  }

  if (input.targets.instagram && meta.igUserId && !igMediaId) {
    try {
      if (!igContainerId && !input.continuing && media)
        igContainerId = await createInstagramContainer(meta, input.kind, media, input.caption)
      if (igContainerId) {
        const state = await instagramContainerStatus(meta, igContainerId)
        if (state === "FINISHED") igMediaId = await publishInstagramContainer(meta, igContainerId)
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
  return {
    status,
    fbPostId,
    igContainerId,
    igMediaId,
    error: errors.length ? errors.join(" · ") : null,
  }
}
