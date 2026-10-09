import type {
  GenerationPlane,
  MediaItem,
  MediaKind,
  MediaRole,
  ModelEntry,
} from "./types"

export const MEDIA_ROLES: MediaRole[] = [
  "source",
  "start",
  "end",
  "reference",
  "video",
  "audio",
]
export const ROLE_LABEL: Record<MediaRole, string> = {
  source: "Source video",
  start: "Start frame",
  end: "End frame",
  reference: "Image references",
  video: "Video references",
  audio: "Audio references",
}
export const ROLE_KIND: Record<MediaRole, MediaKind> = {
  source: "video",
  start: "image",
  end: "image",
  reference: "image",
  video: "video",
  audio: "audio",
}

export function inputRoles(
  model: ModelEntry,
  mode?: string
): ModelEntry["roles"] {
  if (!mode) return model.roles
  const selected = model.mediaModes?.find((item) => item.id === mode)
  if (!selected) throw new Error(`Unknown input mode for ${model.label}.`)
  return selected.roles
}

export function groupMedia(items: MediaItem[]): GenerationPlane["media"] {
  const grouped: GenerationPlane["media"] = {}
  for (const item of items) (grouped[item.role] ??= []).push(item)
  return grouped
}

export function mergeMedia(
  current: MediaItem[],
  role: MediaRole,
  selected: MediaItem[],
  max: number
): MediaItem[] {
  if (
    selected.some(
      (item) =>
        item.role !== role || (item.kind && item.kind !== ROLE_KIND[role])
    )
  )
    throw new Error(
      `Choose ${ROLE_KIND[role]} files for ${ROLE_LABEL[role].toLowerCase()}.`
    )
  const existing =
    max === 1 ? current.filter((item) => item.role !== role) : current
  const next = [...existing]
  for (const item of selected) {
    if (!next.some((other) => other.role === role && other.url === item.url))
      next.push(item)
  }
  if (!max || next.filter((item) => item.role === role).length > max)
    throw new Error(`${ROLE_LABEL[role]}: maximum ${max} attachments.`)
  return next
}

export const REFERENCE_ROLE = {
  image: "reference",
  video: "video",
  audio: "audio",
} as const

export function mergeReferences(
  current: MediaItem[],
  selected: (Omit<MediaItem, "role" | "kind"> & { kind: MediaKind })[],
  roles: ModelEntry["roles"]
): MediaItem[] {
  const next = [...current]
  for (const item of selected) {
    if (next.some((other) => other.url === item.url)) continue
    const role = REFERENCE_ROLE[item.kind]
    const max = roles[role] ?? 0
    if (!max)
      throw new Error(
        `${item.kind} references are not supported by this model.`
      )
    if (next.filter((other) => other.role === role).length >= max)
      throw new Error(`${ROLE_LABEL[role]}: maximum ${max} attachments.`)
    next.push({ ...item, role })
  }
  return next
}

export function inferInputMode(
  model: ModelEntry,
  media: MediaItem[]
): string | undefined {
  if (!media.length || !model.mediaModes) return undefined
  const firstRole =
    media.find((item) => item.role === "start" || item.role === "end")?.role ??
    media[0]!.role
  return model.mediaModes.find((mode) => (mode.roles[firstRole] ?? 0) > 0)?.id
}

export function changeImageRole(
  model: ModelEntry,
  media: MediaItem[],
  id: string,
  role: "reference" | "start" | "end"
): MediaItem[] {
  if (!model.roles[role])
    throw new Error(`${ROLE_LABEL[role]} is not supported by this model.`)
  const target = media.find((item) => item.id === id)
  if (!target || ROLE_KIND[target.role] !== "image")
    throw new Error("Only images can be assigned a frame role.")
  const next = media.map((item): MediaItem => {
    if (item.id === id) return { ...item, role }
    if (role !== "reference" && item.role === role)
      return { ...item, role: "reference" }
    return item
  })
  for (const key of ["reference", "start", "end"] as const) {
    if (
      next.filter((item) => item.role === key).length > (model.roles[key] ?? 0)
    )
      throw new Error(
        `${ROLE_LABEL[key]}: maximum ${model.roles[key] ?? 0} attachments.`
      )
  }
  return next
}

export function validateMedia(
  model: ModelEntry,
  media: GenerationPlane["media"],
  mode?: string
): void {
  const roles = inputRoles(model, mode)
  for (const [key, items] of Object.entries(media)) {
    const role = key as MediaRole
    const max = roles[role] ?? 0
    if (!Array.isArray(items)) throw new Error("Invalid media inputs.")
    if (!items.length) continue
    if (!MEDIA_ROLES.includes(role) || !max) {
      if (
        mode === "frames" &&
        (role === "reference" || role === "video" || role === "audio")
      )
        throw new Error(
          "References are not supported with start/end frames. Change the frame to Reference image, or remove the other references."
        )
      throw new Error(
        `${ROLE_LABEL[role] ?? key} are not supported by this model or input mode.`
      )
    }
    if (items.length > max)
      throw new Error(
        `${ROLE_LABEL[role]}: maximum ${max} for ${model.label}. Remove extra attachments.`
      )
    for (const item of items) {
      if (
        !item ||
        item.role !== role ||
        typeof item.url !== "string" ||
        !/^https?:\/\//.test(item.url)
      )
        throw new Error(`Invalid ${ROLE_LABEL[role].toLowerCase()} URL.`)
      if (item.kind && item.kind !== ROLE_KIND[role])
        throw new Error(
          `${ROLE_LABEL[role]} only accepts ${ROLE_KIND[role]} files.`
        )
    }
  }
  for (const role of model.requiredRoles ?? []) {
    if (!media[role]?.length)
      throw new Error(
        `Add a ${ROLE_LABEL[role].toLowerCase()} to use ${model.label}.`
      )
  }
  if (
    model.mediaModes?.find((item) => item.id === mode)?.requireAny &&
    !Object.values(media).some((items) => items?.length)
  ) {
    throw new Error("Add at least one image, video, or audio reference.")
  }
}
