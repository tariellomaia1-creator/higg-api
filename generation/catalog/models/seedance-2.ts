import { mapSeedance } from "../mappers"
import { SEEDANCE_ASPECT } from "../tokens"
import type { ModelEntry } from "../types"

const seedanceRoles = {
  start: 1,
  end: 1,
  reference: 9,
  video: 3,
  audio: 3,
} as const
const mediaModes: ModelEntry["mediaModes"] = [
  { id: "frames", label: "Text / Frames", roles: { start: 1, end: 1 } },
  {
    id: "references",
    label: "References",
    roles: { reference: 9, video: 3, audio: 3 },
    requireAny: true,
  },
]

const seedanceSettings = {
  aspectRatio: { type: "enum", values: SEEDANCE_ASPECT, default: "16:9" },
  duration: { type: "range", min: 4, max: 15, default: 5 },
  generateAudio: { type: "boolean", default: true },
} as const satisfies ModelEntry["settings"]

export const seedance2: ModelEntry = {
  id: "seedance-2",
  surface: "video",
  label: "Seedance 2.0",
  roles: seedanceRoles,
  mediaModes,
  settings: {
    ...seedanceSettings,
    resolution: {
      type: "enum",
      values: ["480p", "720p", "1080p", "4k"],
      default: "720p",
    },
  },
  icon: "seedance",
  order: 20,
  toPlatform: (plane) => mapSeedance(plane, "bytedance/seedance-2.0"),
}

export const seedance2Fast: ModelEntry = {
  id: "seedance-2-fast",
  surface: "video",
  label: "Seedance 2.0 Fast",
  roles: seedanceRoles,
  mediaModes,
  settings: {
    ...seedanceSettings,
    resolution: { type: "enum", values: ["480p", "720p"], default: "720p" },
  },
  icon: "seedance",
  order: 21,
  toPlatform: (plane) => mapSeedance(plane, "bytedance/seedance-2.0/fast"),
}

export const seedance2Mini: ModelEntry = {
  id: "seedance-2-mini",
  surface: "video",
  label: "Seedance 2.0 Mini",
  roles: seedanceRoles,
  mediaModes,
  settings: {
    ...seedanceSettings,
    resolution: { type: "enum", values: ["480p", "720p"], default: "720p" },
  },
  icon: "seedance",
  order: 22,
  toPlatform: (plane) => mapSeedance(plane, "bytedance/seedance-2.0/mini"),
}

const models = [seedance2, seedance2Fast, seedance2Mini]
export default models
