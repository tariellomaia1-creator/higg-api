import type {
  GenerationPlane,
  MediaRole,
  PlatformPaths,
  PlatformRequest,
} from "./types"

export function urls(plane: GenerationPlane, role: MediaRole): string[] {
  return (plane.media[role] ?? []).map((item) => item.url)
}

/** Generic mapper: picks a path from `spec` by which media roles are filled. */
export function mapByPaths(
  plane: GenerationPlane,
  spec: PlatformPaths
): PlatformRequest {
  const start = urls(plane, "start")[0]
  const end = urls(plane, "end")[0]
  const refs = urls(plane, "reference")
  const videos = urls(plane, "video")
  const body: Record<string, unknown> = {
    prompt: plane.prompt.text,
    ...(plane.settings.aspectRatio
      ? { aspect_ratio: plane.settings.aspectRatio }
      : {}),
    ...(plane.settings.resolution
      ? { resolution: plane.settings.resolution }
      : {}),
    ...(typeof plane.settings.duration === "number"
      ? { duration: plane.settings.duration }
      : {}),
  }
  if (spec.firstLast && (start || end)) {
    return {
      path: spec.firstLast,
      body: {
        ...body,
        ...(start ? { first_frame_url: start } : {}),
        ...(end ? { last_frame_url: end } : {}),
      },
    }
  }
  if (spec.image && start) {
    return {
      path: spec.image,
      body: {
        ...body,
        image_url: start,
        ...(end ? { last_image_url: end } : {}),
      },
    }
  }
  if (spec.reference && (refs.length || videos.length)) {
    return {
      path: spec.reference,
      body: {
        ...body,
        ...(refs.length ? { image_urls: refs } : {}),
        ...(videos.length ? { video_urls: videos } : {}),
      },
    }
  }
  if (spec.text) {
    return {
      path: spec.text,
      body: refs.length ? { ...body, image_urls: refs } : body,
    }
  }
  if (spec.image) return { path: spec.image, body }
  if (spec.reference) return { path: spec.reference, body }
  if (spec.firstLast) return { path: spec.firstLast, body }
  throw new Error("Model has no platform path")
}

function seedanceBody(plane: GenerationPlane, withDuration: boolean) {
  return {
    ...(plane.prompt.text.trim() ? { prompt: plane.prompt.text.trim() } : {}),
    resolution: plane.settings.resolution,
    generate_audio: plane.settings.generateAudio,
    ...(withDuration ? { duration: plane.settings.duration } : {}),
    ...(plane.settings.bitrateMode
      ? { bitrate_mode: plane.settings.bitrateMode }
      : {}),
  }
}

/** Seedance text / image / reference-to-video under one model prefix. */
export function mapSeedance(
  plane: GenerationPlane,
  prefix: string
): PlatformRequest {
  const start = urls(plane, "start")[0]
  const end = urls(plane, "end")[0]
  const refs = urls(plane, "reference")
  const videos = urls(plane, "video")
  const audios = urls(plane, "audio")
  const shared = seedanceBody(plane, true)
  if ((start || end) && (refs.length || videos.length || audios.length))
    throw new Error(
      "Use either frames or references, not both. Remove incompatible attachments."
    )
  if (end && !start)
    throw new Error("Add a start frame before using an end frame.")
  if (start) {
    return {
      path: `${prefix}/image-to-video`,
      body: {
        ...shared,
        image_url: start,
        ...(end ? { end_image_url: end } : {}),
      },
    }
  }
  if (refs.length || videos.length || audios.length) {
    return {
      path: `${prefix}/reference-to-video`,
      body: {
        ...shared,
        aspect_ratio: plane.settings.aspectRatio,
        ...(refs.length ? { image_urls: refs } : {}),
        ...(videos.length ? { video_urls: videos } : {}),
        ...(audios.length ? { audio_urls: audios } : {}),
      },
    }
  }
  if (!plane.prompt.text.trim())
    throw new Error("Enter a prompt or add a reference.")
  return {
    path: `${prefix}/text-to-video`,
    body: { ...shared, aspect_ratio: plane.settings.aspectRatio },
  }
}

/** Seedance edit / extend: one source video plus optional references. */
export function mapSeedanceSource(
  plane: GenerationPlane,
  path: string,
  withDuration: boolean
): PlatformRequest {
  const [video] = urls(plane, "source")
  const extraVideos = urls(plane, "video")
  const refs = urls(plane, "reference")
  const audios = urls(plane, "audio")
  return {
    path,
    body: {
      ...seedanceBody(plane, withDuration),
      ...(video ? { video_url: video } : {}),
      ...(refs.length ? { image_urls: refs } : {}),
      ...(extraVideos.length ? { video_urls: extraVideos } : {}),
      ...(audios.length ? { audio_urls: audios } : {}),
    },
  }
}
