"use client"

import { useRef, useState, type ChangeEvent, type ReactNode } from "react"
import {
  AudioLines,
  Check,
  ChevronDown,
  Clapperboard,
  Ellipsis,
  ImageIcon,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemContent,
  SelectItemDescription,
  SelectItemIcon,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type {
  MediaItem,
  MediaKind,
  MediaRole,
  ModelEntry,
  Surface,
} from "@/generation/catalog"
import {
  inputRoles,
  MEDIA_ROLES,
  REFERENCE_ROLE,
  ROLE_KIND,
  ROLE_LABEL,
} from "@/generation/catalog/media-inputs"
import type { AssetLibraryItem, AssetSelection } from "@/lib/studio/uploads"

import { AssetLibraryModal } from "./asset-library"
import { PromptBox, type PromptBoxSurface } from "./prompt-box"
import { SettingsDialog, settingLabel } from "./settings-dialog"

export const MAX_INLINE_SETTINGS = 1

type ImageRole = "reference" | "start" | "end"

export interface StudioPromptBoxProps {
  surfaces: Surface[]
  surface: Surface
  onSurfaceChange: (surface: Surface) => void
  models: ModelEntry[]
  model: ModelEntry
  onModelChange: (id: string) => void
  settings: Record<string, unknown>
  onSettingChange: (key: string, value: unknown) => void
  inputMode?: string
  media: MediaItem[]
  onMediaAdd: (role: MediaRole | "auto", selection: AssetSelection[]) => void
  onMediaRemove: (id: string) => void
  onMediaRoleChange: (id: string, role: ImageRole) => void
  library: {
    items: AssetLibraryItem[]
    onUpload: (file: File) => Promise<AssetSelection>
  }
  placeholder?: string
  prompt: string
  onPromptChange: (value: string) => void
  cost?: ReactNode
  onGenerate: () => void
  onCancel: () => void
  generating?: boolean
  canceling?: boolean
  generateDisabled?: boolean
  disabledReason?: string
  error?: ReactNode
  skin?: PromptBoxSurface
  className?: string
}

function modelIcon(model: ModelEntry): ReactNode {
  return model.icon ? (
    // eslint-disable-next-line @next/next/no-img-element -- Static SVG logos do not need an image proxy.
    <img
      src={`/model-icons/${model.icon}.svg`}
      alt=""
      className="brightness-0 invert"
    />
  ) : (
    <Clapperboard />
  )
}

export function headlineSetting(model: ModelEntry): string | undefined {
  const enums = Object.entries(model.settings).filter(
    ([, field]) => field.type === "enum"
  )
  return (enums.find(([key]) => /aspect|ratio/.test(key)) ?? enums[0])?.[0]
}

const PICKER_POPUP = {
  variant: "picker",
  surface: "solid",
  side: "bottom",
  align: "start",
  sideOffset: 8,
  collisionPadding: 16,
} as const

function PillSelect({
  value,
  options,
  onValueChange,
  start,
  label,
}: {
  value: string
  options: {
    value: string
    label: string
    description?: string
    icon?: ReactNode
  }[]
  onValueChange: (value: string) => void
  start?: ReactNode
  label: string
}) {
  const current = options.find((option) => option.value === value)
  return (
    <Select
      value={value}
      onValueChange={(next) => next != null && onValueChange(String(next))}
    >
      <SelectTrigger
        bare
        aria-label={label}
        render={
          <PromptBox.Pill
            start={start ?? current?.icon}
            end={<ChevronDown />}
          />
        }
      >
        <SelectValue>{() => current?.label ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent {...PICKER_POPUP}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.icon != null ? (
              <SelectItemIcon>{option.icon}</SelectItemIcon>
            ) : null}
            {option.description != null ? (
              <SelectItemContent>
                <SelectItemText>{option.label}</SelectItemText>
                <SelectItemDescription>
                  {option.description}
                </SelectItemDescription>
              </SelectItemContent>
            ) : (
              <SelectItemText>{option.label}</SelectItemText>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function MediaPreview({ item }: { item: MediaItem }) {
  const kind = item.kind ?? ROLE_KIND[item.role]
  if (kind === "video")
    return (
      <video
        src={item.url}
        muted
        playsInline
        preload="metadata"
        className="size-full object-cover"
      />
    )
  if (kind === "audio") return <AudioLines className="size-5" />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- User uploads bypass the image proxy.
    <img
      src={item.url}
      alt={item.name ?? "Reference image"}
      className="size-full object-cover"
    />
  )
}

function AudioChip({ item, label }: { item: MediaItem; label: string }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div className="flex h-12 w-32 items-center gap-2 rounded-xl bg-white/5 px-2">
      <button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/5"
        aria-label={`${playing ? "Pause" : "Play"} ${item.name ?? label}`}
        onClick={() => {
          if (!audio.current) return
          setFailed(false)
          if (playing) audio.current.pause()
          else void audio.current.play().catch(() => setFailed(true))
        }}
      >
        {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
      </button>
      <span className="min-w-0 truncate text-q-caption-sm-medium">
        {failed ? "Cannot play" : label}
      </span>
      <audio
        ref={audio}
        src={item.url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setPlaying(false)
          setFailed(true)
        }}
      />
    </div>
  )
}

const controlClass =
  "absolute z-10 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[popup-open]:opacity-100"

function mediaSlots(model: ModelEntry, inputMode?: string): MediaRole[] {
  const limits = inputRoles(model, inputMode)
  return MEDIA_ROLES.filter(
    (role) =>
      !!limits[role] &&
      (role === "start" ||
        role === "end" ||
        role === "source" ||
        ((role === "video" || role === "audio") && limits[role] === 1))
  )
}

function ReferencePicker({
  model,
  inputMode,
  media,
  onMediaAdd,
  library,
}: Pick<
  StudioPromptBoxProps,
  "model" | "inputMode" | "media" | "onMediaAdd" | "library"
>) {
  const limits = inputRoles(model, inputMode)
  const slots = mediaSlots(model, inputMode)
  const kinds = (Object.keys(REFERENCE_ROLE) as MediaKind[]).filter(
    (kind) =>
      !slots.includes(REFERENCE_ROLE[kind]) &&
      (limits[REFERENCE_ROLE[kind]] ?? 0) > 0
  )
  const kindLimits = Object.fromEntries(
    kinds.map((kind) => [
      kind,
      Math.max(
        0,
        (limits[REFERENCE_ROLE[kind]] ?? 0) -
          media.filter((item) => item.role === REFERENCE_ROLE[kind]).length
      ),
    ])
  )
  const remaining = Object.values(kindLimits).reduce(
    (total, count) => total + count,
    0
  )
  if (!kinds.length) return null
  return (
    <AssetLibraryModal
      items={library.items}
      onUpload={library.onUpload}
      accept={kinds}
      kindLimits={kindLimits}
      maxSelections={remaining}
      excludeIds={media.map((item) => item.url)}
      onSelectMany={(selection) => onMediaAdd("auto", selection)}
      trigger={
        <PromptBox.Pill
          iconOnly
          aria-label="Add references"
          title="Add references"
          disabled={!remaining}
          className="disabled:opacity-40"
          start={<Plus />}
        />
      }
    />
  )
}

function MediaInputs({
  model,
  inputMode,
  media,
  onMediaAdd,
  onMediaRemove,
  onMediaRoleChange,
  library,
  tilesOnly = false,
}: Pick<
  StudioPromptBoxProps,
  | "model"
  | "inputMode"
  | "media"
  | "onMediaAdd"
  | "onMediaRemove"
  | "onMediaRoleChange"
  | "library"
> & { tilesOnly?: boolean }) {
  const allSlots = mediaSlots(model, inputMode)
  const slots = allSlots.filter(
    (role) =>
      (role === "start" || role === "end" || role === "source") === tilesOnly
  )
  const hasReferenceImages = !!model.roles.reference
  const references = tilesOnly
    ? []
    : media.filter((item) => !allSlots.includes(item.role))
  const imageRoles = (["reference", "start", "end"] as const).filter(
    (role) => model.roles[role]
  )
  const roleMenu = (item: MediaItem) => {
    if (
      ROLE_KIND[item.role] !== "image" ||
      !hasReferenceImages ||
      imageRoles.length < 2
    )
      return null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Role for ${item.name ?? "image"}`}
              className={`${controlClass} -top-1 -left-1`}
            >
              <Ellipsis className="size-3" />
            </button>
          }
        />
        <DropdownMenuContent side="top" align="start" sideOffset={6}>
          {imageRoles.map((role) => (
            <DropdownMenuItem
              key={role}
              onClick={() => onMediaRoleChange(item.id, role)}
            >
              {role === "reference" ? "Reference image" : ROLE_LABEL[role]}
              {item.role === role ? <Check className="ml-auto size-3" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
  const remove = (item: MediaItem) => (
    <button
      type="button"
      aria-label={`Remove ${item.name ?? ROLE_LABEL[item.role]}`}
      className={`${controlClass} -top-1 -right-1`}
      onClick={() => onMediaRemove(item.id)}
    >
      <X className="size-3" />
    </button>
  )

  if (!slots.length && !references.length) return null
  const content = (
    <>
      {slots.map((role) => {
        const item = media.find((entry) => entry.role === role)
        const label =
          role === "video"
            ? "Video"
            : role === "audio"
              ? "Audio"
              : ROLE_LABEL[role]
        return (
          <div key={role} className="group relative shrink-0">
            <AssetLibraryModal
              items={library.items}
              onUpload={library.onUpload}
              accept={[ROLE_KIND[role]]}
              excludeIds={media
                .filter((entry) => entry.role !== role)
                .map((entry) => entry.url)}
              onSelect={(selection) => onMediaAdd(role, [selection])}
              trigger={
                tilesOnly ? (
                  <PromptBox.Upload
                    label={label}
                    src={item?.url}
                    mediaType={ROLE_KIND[role]}
                    alt={item?.name ?? label}
                    aria-label={`${item ? "Replace" : "Add"} ${label.toLowerCase()}`}
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={`${item ? "Replace" : "Add"} ${label.toLowerCase()}`}
                    className="flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/5 pr-3 text-q-caption-sm-medium"
                  >
                    <span className="flex size-12 items-center justify-center overflow-hidden rounded-xl">
                      {item ? (
                        <MediaPreview item={item} />
                      ) : (
                        <Plus className="size-4 text-q-icon-secondary" />
                      )}
                    </span>
                    {label}
                  </button>
                )
              }
            />
            {item ? (
              <>
                {roleMenu(item)}
                {remove(item)}
              </>
            ) : null}
          </div>
        )
      })}
      {references.map((item, index) => {
        const kind = item.kind ?? ROLE_KIND[item.role]
        const ordinal = references
          .slice(0, index + 1)
          .filter(
            (entry) => (entry.kind ?? ROLE_KIND[entry.role]) === kind
          ).length
        const label = `${kind === "image" ? "Image" : kind === "video" ? "Video" : "Audio"} ${ordinal}`
        return (
          <div
            key={item.id}
            className="group relative shrink-0"
            title={`${label}: ${item.name ?? item.url}`}
            data-media-role={item.role}
          >
            {kind === "audio" ? (
              <AudioChip item={item} label={label} />
            ) : (
              <div className="relative size-12 overflow-hidden rounded-xl bg-white/5">
                <MediaPreview item={item} />
                {kind === "video" ? (
                  <Play className="pointer-events-none absolute bottom-1 left-1 size-3 fill-white text-white drop-shadow" />
                ) : null}
              </div>
            )}
            {roleMenu(item)}
            {remove(item)}
          </div>
        )
      })}
      {!tilesOnly && media.length > 1 ? (
        <button
          type="button"
          aria-label="Clear attachments"
          title="Clear attachments"
          className="flex size-7 items-center justify-center rounded-full text-q-icon-secondary hover:bg-white/5 hover:text-q-icon-primary"
          onClick={() => media.forEach((item) => onMediaRemove(item.id))}
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </>
  )
  return tilesOnly ? (
    <PromptBox.Uploads>{content}</PromptBox.Uploads>
  ) : (
    <div
      className="flex max-h-36 flex-wrap items-center gap-2 overflow-y-auto p-1"
      aria-label="Attached media"
    >
      {content}
    </div>
  )
}

export function StudioPromptBox({
  surfaces,
  surface,
  onSurfaceChange,
  models,
  model,
  onModelChange,
  settings,
  onSettingChange,
  inputMode,
  media,
  onMediaAdd,
  onMediaRemove,
  onMediaRoleChange,
  library,
  placeholder = "Describe the scene you imagine...",
  prompt,
  onPromptChange,
  cost,
  onGenerate,
  onCancel,
  generating = false,
  canceling = false,
  generateDisabled = false,
  disabledReason,
  error,
  skin,
  className = "w-[830px] max-w-full",
}: StudioPromptBoxProps) {
  const headline = headlineSetting(model)
  const headlineField = headline ? model.settings[headline] : undefined
  return (
    <PromptBox.Root surface={skin} className={className}>
      <PromptBox.ModeRail hidden={surfaces.length < 2}>
        {surfaces.map((value) => (
          <PromptBox.Mode
            key={value}
            active={surface === value}
            onClick={() => onSurfaceChange(value)}
            start={value === "video" ? <Clapperboard /> : <ImageIcon />}
          >
            {value === "video" ? "Video" : "Image"}
          </PromptBox.Mode>
        ))}
      </PromptBox.ModeRail>
      <PromptBox.Body>
        <MediaInputs
          {...{
            model,
            inputMode,
            media,
            onMediaAdd,
            onMediaRemove,
            onMediaRoleChange,
            library,
          }}
        />
        <PromptBox.Field
          placeholder={placeholder}
          aria-label={placeholder}
          value={prompt}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onPromptChange(event.target.value)
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey) &&
              !generating &&
              !generateDisabled
            ) {
              event.preventDefault()
              onGenerate()
            }
          }}
        />
        {error != null ? (
          <p
            className="px-1 pb-1 text-q-caption-sm-medium text-q-state-error-fg"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <PromptBox.Actions className="flex-wrap">
          <ReferencePicker
            {...{ model, inputMode, media, onMediaAdd, library }}
          />
          <PillSelect
            label="Model"
            value={model.id}
            onValueChange={onModelChange}
            options={models.map((entry) => ({
              value: entry.id,
              label: entry.label,
              icon: modelIcon(entry),
            }))}
          />
          {headline && headlineField?.type === "enum" ? (
            <PillSelect
              label={settingLabel(headline)}
              value={
                typeof settings[headline] === "string"
                  ? (settings[headline] as string)
                  : headlineField.default
              }
              onValueChange={(value) => onSettingChange(headline, value)}
              options={headlineField.values.map((value) => ({
                value,
                label: value,
              }))}
            />
          ) : null}
          <SettingsDialog
            model={model}
            values={settings}
            onChange={onSettingChange}
            trigger={
              <PromptBox.Pill
                iconOnly
                aria-label="All settings"
                start={<SlidersHorizontal />}
              />
            }
          />
        </PromptBox.Actions>
      </PromptBox.Body>
      <MediaInputs
        tilesOnly
        {...{
          model,
          inputMode,
          media,
          onMediaAdd,
          onMediaRemove,
          onMediaRoleChange,
          library,
        }}
      />
      <PromptBox.Generate
        cost={generating ? undefined : cost}
        onClick={generating ? onCancel : onGenerate}
        disabled={canceling || (!generating && generateDisabled)}
        title={!generating && generateDisabled ? disabledReason : undefined}
      >
        {canceling ? "Cancelling…" : generating ? "Cancel" : "Generate"}
      </PromptBox.Generate>
    </PromptBox.Root>
  )
}
