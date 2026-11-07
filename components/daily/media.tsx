"use client"

import { Check, Copy, Download, Expand } from "lucide-react"
import { useState } from "react"

import { USD_PER_CREDIT } from "@/daily/config"
import type { DailyItem } from "@/daily/db"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function isBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com")
  } catch {
    return false
  }
}

/** Stored files may sit in a private Blob store, so the browser loads them
    through the signed-in media route. kie.ai's temporary links load as is. */
export function mediaSrc(url: string): string {
  return isBlobUrl(url) ? `/api/daily/media?u=${encodeURIComponent(url)}` : url
}

export function downloadSrc(url: string, fileName: string): string {
  return isBlobUrl(url)
    ? `/api/daily/media?u=${encodeURIComponent(url)}&download=${encodeURIComponent(fileName)}`
    : url
}

export function itemTitle(item: Pick<DailyItem, "kind" | "slot">): string {
  return `${item.kind === "video" ? "ვიდეო" : "პოსტერი"} ${item.slot + 1}`
}

export function fileNameFor(item: Pick<DailyItem, "kind" | "slot" | "day">): string {
  return `behero-${item.day}-${item.kind}-${item.slot + 1}.${item.kind === "video" ? "mp4" : "jpg"}`
}

/** Result thumbnail that opens a large viewer. */
export function ResultPreview({
  item,
  className,
}: {
  item: DailyItem
  className?: string
}) {
  const [open, setOpen] = useState(false)
  if (!item.resultUrl) return null
  const src = mediaSrc(item.resultUrl)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative block w-full overflow-hidden rounded-xl bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          item.kind === "video" ? "aspect-[9/16]" : "aspect-square",
          className
        )}
        aria-label={`${itemTitle(item)}: დიდად ნახვა`}
      >
        {item.kind === "video" ? (
          <video
            src={src}
            muted
            playsInline
            loop
            preload="metadata"
            className="size-full object-cover"
            onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(event) => event.currentTarget.pause()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={itemTitle(item)} className="size-full object-cover" />
        )}
        <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white opacity-90 transition-opacity group-hover:opacity-100">
          <Expand className="size-3.5" /> გახსნა
        </span>
      </button>
      <ResultViewer item={item} open={open} onOpenChange={setOpen} />
    </>
  )
}

export function ResultViewer({
  item,
  open,
  onOpenChange,
}: {
  item: DailyItem
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [copied, setCopied] = useState(false)
  if (!item.resultUrl) return null
  const src = mediaSrc(item.resultUrl)
  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(item.caption)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {itemTitle(item)} · {item.day}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4 md:flex-row">
            <div
              className={cn(
                "mx-auto overflow-hidden rounded-xl bg-black",
                item.kind === "video" ? "aspect-[9/16] w-full max-w-72" : "aspect-square w-full max-w-md"
              )}
            >
              {item.kind === "video" ? (
                <video src={src} controls autoPlay playsInline className="size-full object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={itemTitle(item)} className="size-full object-contain" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3 text-sm">
              <a
                href={downloadSrc(item.resultUrl, fileNameFor(item))}
                download={fileNameFor(item)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 font-medium text-primary-foreground hover:bg-primary/80"
              >
                <Download className="size-4" /> ჩამოტვირთვა
              </a>
              {item.caption ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Caption</p>
                  <p className="whitespace-pre-wrap">{item.caption}</p>
                  <Button variant="secondary" size="sm" onClick={copyCaption}>
                    {copied ? <Check /> : <Copy />} {copied ? "დაკოპირდა" : "კოპირება"}
                  </Button>
                </div>
              ) : null}
              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">პრომტი</summary>
                <p className="mt-2 whitespace-pre-wrap text-xs">{item.prompt}</p>
              </details>
              {item.creditsUsed > 0 ? (
                <p className="text-xs text-muted-foreground">
                  დაიხარჯა: {item.creditsUsed} კრედიტი (≈ ${(item.creditsUsed * USD_PER_CREDIT).toFixed(2)})
                </p>
              ) : null}
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
