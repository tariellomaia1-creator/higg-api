/* eslint-disable @next/next/no-img-element */
"use client"

import type {
  CSSProperties,
  FocusEventHandler,
  MouseEvent,
  MouseEventHandler,
  ReactNode,
} from "react"
import { EllipsisVertical, Loader2, type LucideIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { downloadMedia } from "@/lib/studio/download-media"
import { cn } from "@/lib/utils"

import {
  GenerationDetailModal,
  type GenerationDetail,
} from "./generation-detail"

/**
 * GenerationCard / GenerationTile / CardActions — the one way to render a
 * single generation anywhere (feed tile, wizard result, hero result).
 *
 *   • `generating` → the pulsing placeholder with a status pill.
 *   • `failed`     → a stable neutral tile so terminal jobs never vanish.
 *   • `ready`      → the asset, a full-bleed open trigger for the shared
 *                    `GenerationDetailModal`, and the hover action rail
 *                    (≤3 controls; extras collapse into a ⋯ menu).
 */

export type GenerationCardState = "ready" | "generating" | "failed"

export interface GenerationCardProps {
  state?: GenerationCardState
  src?: string
  alt?: string
  media?: ReactNode
  title?: ReactNode
  generatingLabel?: ReactNode
  failureLabel?: ReactNode
  children?: ReactNode
  className?: string
  style?: CSSProperties
  onMouseEnter?: MouseEventHandler<HTMLDivElement>
  onMouseLeave?: MouseEventHandler<HTMLDivElement>
}

export function GenerationCard({
  state = "ready",
  src,
  alt = "",
  media,
  title,
  generatingLabel = "Generating",
  failureLabel = "The generation did not produce previewable media.",
  className,
  children,
  ...props
}: GenerationCardProps) {
  return (
    <div
      data-state={state}
      className={cn(
        "relative block w-full min-w-0 overflow-hidden bg-white/5",
        className
      )}
      {...props}
    >
      <div className="size-full">
        {state === "ready"
          ? (media ??
            (src ? (
              <img
                src={src}
                alt={alt}
                className="absolute inset-0 size-full object-cover"
              />
            ) : null))
          : media}
      </div>
      {state === "ready" && title != null ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2.5">
          <span className="block truncate text-sm font-semibold text-white">
            {title}
          </span>
        </div>
      ) : null}
      {state === "generating" ? (
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <span
            className="studio-glow absolute inset-x-0 top-0 h-[45%]"
            aria-hidden="true"
          />
          <span
            className="absolute top-2 left-2 inline-flex items-center gap-2 rounded-full bg-white/8 py-1.5 pr-4 pl-2.5 backdrop-blur-md"
            role="status"
          >
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span className="text-sm font-medium text-primary">
              {generatingLabel}
            </span>
          </span>
        </span>
      ) : null}
      {state === "failed" ? (
        <span
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/5 p-4 text-center"
          role="status"
        >
          <span className="text-sm font-semibold text-foreground">
            Generation unavailable
          </span>
          <span className="text-xs text-muted-foreground">{failureLabel}</span>
        </span>
      ) : null}
      {children}
    </div>
  )
}

/* ── CardActions ──────────────────────────────────────────────────────────── */
export interface CardAction {
  id: string
  label: string
  icon: LucideIcon
  onSelect?: () => void
  danger?: boolean
}

const GLASS =
  "pointer-events-auto flex size-8 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function stop(event: MouseEvent) {
  event.stopPropagation()
}

export function CardActions({
  actions,
  max = 3,
}: {
  actions: CardAction[]
  max?: number
}) {
  if (actions.length === 0) return null
  const overflow = actions.length > max
  const inline = overflow ? actions.slice(0, max - 1) : actions
  const extra = overflow ? actions.slice(max - 1) : []
  return (
    <div className="pointer-events-none absolute top-2 right-2 z-[2] flex flex-col items-center gap-1.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
      {inline.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-label={action.label}
          className={GLASS}
          onPointerDown={stop}
          onClick={(event) => {
            event.stopPropagation()
            action.onSelect?.()
          }}
        >
          <action.icon className="size-4" />
        </button>
      ))}
      {extra.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More actions"
            className={GLASS}
            onPointerDown={stop}
            onClick={stop}
          >
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} onClick={stop}>
            {extra.map((action) => (
              <DropdownMenuItem
                key={action.id}
                variant={action.danger ? "destructive" : "default"}
                onClick={() => action.onSelect?.()}
              >
                <action.icon /> {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

/* ── GenerationTile ───────────────────────────────────────────────────────── */
export interface GenerationTileProps {
  state?: GenerationCardState
  generation?: GenerationDetail
  src?: string
  alt?: string
  media?: ReactNode
  title?: ReactNode
  generatingLabel?: ReactNode
  failureLabel?: ReactNode
  actions?: CardAction[]
  children?: ReactNode
  openable?: boolean
  openLabel?: string
  className?: string
  style?: CSSProperties
  onMouseEnter?: MouseEventHandler<HTMLDivElement>
  onMouseLeave?: MouseEventHandler<HTMLDivElement>
  onFocus?: FocusEventHandler<HTMLButtonElement>
  onBlur?: FocusEventHandler<HTMLButtonElement>
}

export function GenerationTile({
  state = "ready",
  generation,
  src,
  alt = "",
  media,
  title,
  generatingLabel = "Generating",
  failureLabel,
  actions,
  children,
  openable,
  openLabel,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: GenerationTileProps) {
  if (state !== "ready") {
    return (
      <GenerationCard
        state={state}
        generatingLabel={generatingLabel}
        failureLabel={failureLabel}
        className={className}
        style={style}
      />
    )
  }
  const canOpen = openable !== false && generation != null
  const downloadUrl = generation?.src ?? src
  const resolved = actions?.map((a) =>
    a.id === "download" && a.onSelect == null && downloadUrl
      ? { ...a, onSelect: () => void downloadMedia(downloadUrl) }
      : a
  )

  return (
    <GenerationCard
      src={media == null ? (src ?? generation?.src) : undefined}
      alt={alt}
      title={title}
      media={media}
      className={cn("group", className)}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {canOpen ? (
        <GenerationDetailModal
          generation={generation}
          trigger={
            <button
              type="button"
              aria-label={
                openLabel ??
                (generation?.prompt
                  ? `Open generation: ${generation.prompt}`
                  : "Open generation")
              }
              className="absolute inset-0 z-[1] cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
              onFocus={onFocus}
              onBlur={onBlur}
            />
          }
        />
      ) : null}
      {children}
      {resolved && resolved.length > 0 ? (
        <CardActions actions={resolved} />
      ) : null}
    </GenerationCard>
  )
}
