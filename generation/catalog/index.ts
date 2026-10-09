import { MODELS } from "./models.generated"
import { parseSettings } from "./parse-settings"
import type { ModelEntry } from "./types"

export { MODELS }

export function getModel(id: string): ModelEntry {
  const model = MODELS.find((entry) => entry.id === id)
  if (!model) throw new Error(`Unknown model: ${id}`)
  return model
}

/** First video model, else the first model; undefined when no model files are installed. */
export function defaultModel(): ModelEntry | undefined {
  return MODELS.find((entry) => entry.surface === "video") ?? MODELS[0]
}

export type {
  GenerationPlane,
  MediaItem,
  MediaKind,
  MediaRole,
  ModelEntry,
  PlatformPaths,
  PlatformRequest,
  Surface,
} from "./types"
export { parseSettings }
