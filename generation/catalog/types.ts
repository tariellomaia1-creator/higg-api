export type Surface = "image" | "video"
export type MediaKind = "image" | "video" | "audio"
export type MediaRole =
  "start" | "end" | "reference" | "video" | "audio" | "source"

export type MediaItem = {
  id: string
  url: string
  role: MediaRole
  kind?: MediaKind
  name?: string
}

export type MediaMode = {
  id: string
  label: string
  roles: Partial<Record<MediaRole, number>>
  requireAny?: boolean
}

export type SettingField =
  | { type: "enum"; values: readonly string[]; default: string }
  | { type: "range"; min: number; max: number; default: number; step?: number }
  | { type: "boolean"; default: boolean }

export type PlatformPaths = {
  text?: string
  image?: string
  firstLast?: string
  reference?: string
}

/** Platform request: model path (appended to HF_API_BASE_URL) and JSON body. */
export type PlatformRequest = { path: string; body: Record<string, unknown> }

export type ModelEntry = {
  id: string
  surface: Surface
  label: string
  roles: Partial<Record<MediaRole, number>>
  mediaModes?: MediaMode[]
  requiredRoles?: MediaRole[]
  requirePrompt?: boolean
  settings: Record<string, SettingField>
  /** Submit paths when the shared mapper is enough. Soul, Kling 3, and Seedance keep custom maps. */
  paths?: PlatformPaths
  /** Custom mapper; wins over `paths`. */
  toPlatform?: (plane: GenerationPlane) => PlatformRequest
  /** Brand file name in /public/model-icons (without .svg). */
  icon?: string
  /** Picker order, lower first. Unset sorts last. */
  order?: number
}

export type GenerationPlane = {
  model: string
  inputMode?: string
  prompt: { text: string }
  media: Partial<Record<MediaRole, MediaItem[]>>
  settings: Record<string, unknown>
}
