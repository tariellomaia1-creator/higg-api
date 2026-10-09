/* eslint-disable @next/next/no-img-element */
"use client"

import { useState } from "react"
import type { ReactElement, ReactNode } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Copy, Download, Share2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { downloadMedia } from "@/lib/studio/download-media"
import { cn } from "@/lib/utils"

/**
 * GenerationDetailModal — the full-screen lightbox every finished generation
 * opens through. Three layers: the media as a blurred backdrop, the crisp
 * media stage, and a frosted right panel with the prompt, details and actions.
 * The layout is fixed; the panel's `rows` and `actions` are the content.
 */
export interface GenerationDetail {
  src: string
  mediaType?: "image" | "video"
  poster?: string
  aspectRatio?: number
  prompt?: string
  model?: string
  createdAt?: number
  settings?: Record<string, unknown>
}

export interface GenerationDetailRow {
  id: string
  label: string
  value: ReactNode
}

export interface GenerationDetailModalProps {
  trigger: ReactElement
  generation: GenerationDetail
  rows?: GenerationDetailRow[]
  /** Replaces the default footer (Download · Copy prompt · Share). */
  actions?: ReactNode
}

async function copyText(text: string) {
  await navigator.clipboard?.writeText(text)
}

function defaultRows(g: GenerationDetail): GenerationDetailRow[] {
  const rows: GenerationDetailRow[] = []
  if (g.model) rows.push({ id: "model", label: "Model", value: g.model })
  rows.push({
    id: "type",
    label: "Type",
    value: g.mediaType === "video" ? "Video" : "Image",
  })
  if (g.createdAt)
    rows.push({
      id: "created",
      label: "Created",
      value: new Date(g.createdAt).toLocaleString(),
    })
  for (const [key, value] of Object.entries(g.settings ?? {})) {
    if (value === undefined || value === null) continue
    rows.push({ id: key, label: key.replace(/_/g, " "), value: String(value) })
  }
  return rows
}

export function GenerationDetailModal({
  trigger,
  generation,
  rows,
  actions,
}: GenerationDetailModalProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const isVideo = generation.mediaType === "video"
  const backdrop = isVideo ? generation.poster : generation.src
  const detailRows = rows ?? defaultRows(generation)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger render={trigger} />
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/80 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col duration-150 outline-none md:flex-row data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
          <DialogPrimitive.Title className="sr-only">
            Generation
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {generation.prompt ?? "Generated media"}
          </DialogPrimitive.Description>
          {backdrop ? (
            <img
              aria-hidden
              src={backdrop}
              alt=""
              className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-40 blur-3xl"
            />
          ) : null}
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 md:p-8">
            {isVideo ? (
              <video
                src={generation.src}
                poster={generation.poster}
                controls
                autoPlay
                loop
                playsInline
                className="max-h-full max-w-full rounded-xl shadow-2xl"
              />
            ) : (
              <img
                src={generation.src}
                alt={generation.prompt ?? ""}
                className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
              />
            )}
          </div>
          <aside className="relative flex w-full shrink-0 flex-col gap-4 border-t border-white/10 bg-background/70 p-4 backdrop-blur-xl md:m-4 md:w-[360px] md:rounded-2xl md:border">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Generation</span>
              <DialogPrimitive.Close
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Close" />
                }
              >
                <X />
              </DialogPrimitive.Close>
            </div>
            {generation.prompt ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Prompt
                </span>
                <p className="max-h-40 overflow-y-auto text-sm leading-6">
                  {generation.prompt}
                </p>
              </div>
            ) : null}
            {detailRows.length > 0 ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {detailRows.map((row) => (
                  <div key={row.id} className="contents">
                    <dt className="text-muted-foreground capitalize">
                      {row.label}
                    </dt>
                    <dd className="truncate text-right tabular-nums">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <div className="mt-auto flex items-center gap-2">
              {actions ?? (
                <>
                  <Button
                    className="flex-1"
                    onClick={() => void downloadMedia(generation.src)}
                  >
                    <Download /> Download
                  </Button>
                  {generation.prompt ? (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Copy prompt"
                      className={cn(copied && "text-primary")}
                      onClick={() => {
                        void copyText(generation.prompt!).then(() => {
                          setCopied(true)
                          window.setTimeout(() => setCopied(false), 1200)
                        })
                      }}
                    >
                      <Copy />
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Share"
                    onClick={() => {
                      const url = new URL(generation.src, window.location.href)
                        .href
                      if (navigator.share)
                        void navigator
                          .share({ text: generation.prompt, url })
                          .catch(() => undefined)
                      else void copyText(url)
                    }}
                  >
                    <Share2 />
                  </Button>
                </>
              )}
            </div>
          </aside>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
