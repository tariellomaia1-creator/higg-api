import { urls } from "../mappers"
import type { GenerationPlane, ModelEntry, PlatformRequest } from "../types"

const klingTurboSettings = {
  aspectRatio: {
    type: "enum",
    values: ["16:9", "9:16", "1:1"],
    default: "16:9",
  },
  resolution: { type: "enum", values: ["720p", "1080p"], default: "720p" },
  duration: { type: "range", min: 3, max: 15, default: 5 },
} as const satisfies ModelEntry["settings"]

const kling3Settings = {
  aspectRatio: {
    type: "enum",
    values: ["16:9", "9:16", "1:1"],
    default: "16:9",
  },
  duration: { type: "range", min: 3, max: 15, default: 5 },
  sound: { type: "boolean", default: true },
  cfgScale: { type: "range", min: 0, max: 1, default: 0.5, step: 0.01 },
  multiShots: { type: "boolean", default: false },
} as const satisfies ModelEntry["settings"]

const klingMotionSettings = {
  keepOriginalSound: { type: "boolean", default: true },
  characterOrientation: {
    type: "enum",
    values: ["video", "image"],
    default: "video",
  },
} as const satisfies ModelEntry["settings"]

function mapKlingTurbo(plane: GenerationPlane): PlatformRequest {
  const start = urls(plane, "start")[0]
  return {
    path: start
      ? "kling-video/v3.0-turbo/image-to-video"
      : "kling-video/v3.0-turbo/text-to-video",
    body: {
      prompt: plane.prompt.text,
      duration: plane.settings.duration,
      resolution: plane.settings.resolution,
      ...(start
        ? { image_url: start }
        : { aspect_ratio: plane.settings.aspectRatio }),
    },
  }
}

function mapKling3(plane: GenerationPlane, prefix: string): PlatformRequest {
  const start = urls(plane, "start")[0]
  const end = urls(plane, "end")[0]
  const body: Record<string, unknown> = {
    prompt: plane.prompt.text,
    sound: plane.settings.sound ? "on" : "off",
    duration: plane.settings.duration,
    cfg_scale: plane.settings.cfgScale,
    multi_shots: plane.settings.multiShots,
  }
  if (start) {
    body.image_url = start
    if (end) body.last_image_url = end
    return { path: `${prefix}/image-to-video`, body }
  }
  body.aspect_ratio = plane.settings.aspectRatio
  return { path: `${prefix}/text-to-video`, body }
}

function mapKlingMotion(plane: GenerationPlane, path: string): PlatformRequest {
  const start = urls(plane, "start")[0]
  const video = urls(plane, "video")[0]
  return {
    path,
    body: {
      prompt: plane.prompt.text,
      ...(start ? { image_url: start } : {}),
      ...(video ? { video_url: video } : {}),
      keep_original_sound: plane.settings.keepOriginalSound ? "yes" : "no",
      character_orientation: plane.settings.characterOrientation,
    },
  }
}

export const kling3Turbo: ModelEntry = {
  id: "kling-3-turbo",
  surface: "video",
  label: "Kling 3.0 Turbo",
  roles: { start: 1 },
  settings: klingTurboSettings,
  icon: "kling",
  order: 30,
  toPlatform: mapKlingTurbo,
}

export const kling3Std: ModelEntry = {
  id: "kling-3-std",
  surface: "video",
  label: "Kling 3.0 Standard",
  roles: { start: 1, end: 1 },
  settings: kling3Settings,
  icon: "kling",
  order: 31,
  toPlatform: (plane) => mapKling3(plane, "kling-video/v3.0/std"),
}

export const kling3Pro: ModelEntry = {
  id: "kling-3-pro",
  surface: "video",
  label: "Kling 3.0 Pro",
  roles: { start: 1, end: 1 },
  settings: kling3Settings,
  icon: "kling",
  order: 32,
  toPlatform: (plane) => mapKling3(plane, "kling-video/v3.0/pro"),
}

export const kling34k: ModelEntry = {
  id: "kling-3-4k",
  surface: "video",
  label: "Kling 3.0 4K",
  roles: { start: 1, end: 1 },
  settings: kling3Settings,
  icon: "kling",
  order: 33,
  toPlatform: (plane) => mapKling3(plane, "kling-video/v3.0/4k"),
}

export const kling3MotionStd: ModelEntry = {
  id: "kling-3-motion-std",
  surface: "video",
  label: "Kling 3.0 Motion Control",
  roles: { start: 1, video: 1 },
  settings: klingMotionSettings,
  icon: "kling",
  order: 34,
  toPlatform: (plane) =>
    mapKlingMotion(plane, "kling-video/v3/motion-control/std"),
}

export const kling3MotionPro: ModelEntry = {
  id: "kling-3-motion-pro",
  surface: "video",
  label: "Kling 3.0 Motion Control Pro",
  roles: { start: 1, video: 1 },
  settings: klingMotionSettings,
  icon: "kling",
  order: 35,
  toPlatform: (plane) =>
    mapKlingMotion(plane, "kling-video/v3/motion-control/pro"),
}

const models = [
  kling3Turbo,
  kling3Std,
  kling3Pro,
  kling34k,
  kling3MotionStd,
  kling3MotionPro,
]
export default models
