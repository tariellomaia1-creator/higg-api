import { getModel, parseSettings } from "./catalog"
import type { GenerationPlane } from "./catalog/types"
import { groupMedia } from "./catalog/media-inputs"
import { useActive } from "./stores/active"
import { useImageMedia, useVideoMedia } from "./stores/media"
import { useImagePrompt, useVideoPrompt } from "./stores/prompt"
import { useSettings } from "./stores/settings"

export function assemblePlane(): GenerationPlane {
  const { model: modelId, surface } = useActive.getState()
  const model = getModel(modelId)
  const text = (
    surface === "image" ? useImagePrompt : useVideoPrompt
  ).getState().text
  const items = (surface === "image" ? useImageMedia : useVideoMedia).getState()
    .items
  return {
    model: model.id,
    prompt: { text },
    media: groupMedia(items),
    settings: parseSettings(
      model,
      useSettings.getState().byModel[model.id] ?? {}
    ),
  }
}
