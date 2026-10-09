import { SOUL_ASPECT } from "../tokens"
import type { GenerationPlane, ModelEntry, PlatformRequest } from "../types"

const soulSettings = {
  aspectRatio: { type: "enum", values: SOUL_ASPECT, default: "1:1" },
  resolution: { type: "enum", values: ["720p", "1080p"], default: "720p" },
  batchSize: { type: "enum", values: ["1", "4"], default: "1" },
  enhancePrompt: { type: "boolean", default: false },
} as const satisfies ModelEntry["settings"]

function mapSoul(plane: GenerationPlane, path: string): PlatformRequest {
  return {
    path,
    body: {
      prompt: plane.prompt.text,
      batch_size: Number(plane.settings.batchSize),
      resolution: plane.settings.resolution,
      aspect_ratio: plane.settings.aspectRatio,
      enhance_prompt: plane.settings.enhancePrompt,
    },
  }
}

export const soul2: ModelEntry = {
  id: "soul-2",
  surface: "image",
  label: "Soul 2",
  roles: {},
  settings: soulSettings,
  icon: "higgsfield",
  order: 0,
  toPlatform: (plane) => mapSoul(plane, "higgsfield-ai/soul/v2/standard"),
}

export const soulCinema: ModelEntry = {
  id: "soul-cinema",
  surface: "image",
  label: "Soul Cinema",
  roles: {},
  settings: soulSettings,
  icon: "higgsfield",
  order: 1,
  toPlatform: (plane) => mapSoul(plane, "higgsfield-ai/soul/cinema"),
}

const models = [soul2, soulCinema]
export default models
