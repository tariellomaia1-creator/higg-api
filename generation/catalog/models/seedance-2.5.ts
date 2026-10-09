import { mapSeedance, mapSeedanceSource } from "../mappers"
import { SEEDANCE_ASPECT } from "../tokens"
import type { ModelEntry } from "../types"

const seedance25Settings = {
  resolution: { type: "enum", values: ["480p", "720p"], default: "720p" },
  generateAudio: { type: "boolean", default: true },
  bitrateMode: { type: "enum", values: ["standard", "high"], default: "high" },
} as const satisfies ModelEntry["settings"]

export const seedance25: ModelEntry = {
  id: "seedance-2.5",
  surface: "video",
  label: "Seedance 2.5",
  roles: { start: 1, end: 1, reference: 30, video: 10, audio: 10 },
  mediaModes: [
    { id: "frames", label: "Text / Frames", roles: { start: 1, end: 1 } },
    {
      id: "references",
      label: "References",
      roles: { reference: 30, video: 10, audio: 10 },
      requireAny: true,
    },
  ],
  settings: {
    aspectRatio: { type: "enum", values: SEEDANCE_ASPECT, default: "16:9" },
    duration: { type: "range", min: 4, max: 30, default: 5 },
    ...seedance25Settings,
  },
  icon: "seedance",
  order: 10,
  toPlatform: (plane) => mapSeedance(plane, "bytedance/seedance-2.5"),
}

export const seedance25Edit: ModelEntry = {
  id: "seedance-2.5-edit",
  surface: "video",
  label: "Seedance 2.5 Edit",
  roles: { source: 1, video: 10, reference: 30, audio: 10 },
  requiredRoles: ["source"],
  requirePrompt: true,
  settings: seedance25Settings,
  icon: "seedance",
  order: 11,
  toPlatform: (plane) =>
    mapSeedanceSource(plane, "bytedance/seedance-2.5/video-edit", false),
}

export const seedance25Extend: ModelEntry = {
  id: "seedance-2.5-extend",
  surface: "video",
  label: "Seedance 2.5 Extend",
  roles: { source: 1, video: 10, reference: 30, audio: 10 },
  requiredRoles: ["source"],
  requirePrompt: true,
  settings: {
    duration: { type: "range", min: 4, max: 30, default: 5 },
    ...seedance25Settings,
  },
  icon: "seedance",
  order: 12,
  toPlatform: (plane) =>
    mapSeedanceSource(plane, "bytedance/seedance-2.5/video-extend", true),
}

const models = [seedance25, seedance25Edit, seedance25Extend]
export default models
