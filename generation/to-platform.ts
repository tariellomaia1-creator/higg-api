import { getModel } from "./catalog"
import { mapByPaths } from "./catalog/mappers"
import { validateMedia } from "./catalog/media-inputs"
import type { GenerationPlane, PlatformRequest } from "./catalog/types"

export function toPlatform(plane: GenerationPlane): PlatformRequest {
  const model = getModel(plane.model)
  validateMedia(model, plane.media, plane.inputMode)
  if (model.requirePrompt && !plane.prompt.text.trim())
    throw new Error(`A prompt is required for ${model.label}.`)
  if (model.toPlatform) return model.toPlatform(plane)
  if (model.paths) return mapByPaths(plane, model.paths)
  throw new Error(`No platform map for ${plane.model}`)
}
