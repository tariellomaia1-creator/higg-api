"use client"

import { upload } from "@vercel/blob/client"
import {
  Download,
  ImagePlus,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react"
import { useId, useRef, useState } from "react"

import type { ItemKind } from "@/daily/config"
import { formatHour, publishHour } from "@/daily/config"
import {
  clearPlanItem,
  retryGeneration,
  retryPublish,
  savePlanItem,
} from "@/daily/actions"
import type { DailyItem } from "@/daily/db"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const GEN_LABEL: Record<DailyItem["status"], string> = {
  pending: "მოლოდინში",
  generating: "გენერირდება…",
  ready: "მზადაა",
  failed: "ვერ შეიქმნა",
}

const PUBLISH_LABEL: Record<DailyItem["publishStatus"], string> = {
  waiting: "დაგეგმილია",
  publishing: "ქვეყნდება…",
  published: "გამოქვეყნდა",
  partial: "ნაწილობრივ გამოქვეყნდა",
  failed: "ვერ გამოქვეყნდა",
}

type Props = {
  day: string
  kind: ItemKind
  slot: number
  item: DailyItem | undefined
  /** Meta is connected: show the posting hour and publish status. */
  autoPublish: boolean
  onChanged: () => void
}

export function SlotCard({ day, kind, slot, item, autoPublish, onChanged }: Props) {
  const fieldId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [prompt, setPrompt] = useState(item?.prompt ?? "")
  const [caption, setCaption] = useState(item?.caption ?? "")
  const [image, setImage] = useState<{ url: string; bytes: number } | null>(
    item?.startImageUrl
      ? { url: item.startImageUrl, bytes: item.startImageBytes }
      : null
  )
  const [busy, setBusy] = useState<null | "upload" | "save" | "clear" | "retry">(
    null
  )
  const [error, setError] = useState<string | null>(null)

  const dirty =
    prompt.trim() !== (item?.prompt ?? "") ||
    caption.trim() !== (item?.caption ?? "") ||
    (image?.url ?? null) !== (item?.startImageUrl ?? null)
  const incomplete = !prompt.trim() || (kind === "video" && !image)
  const title = `${kind === "video" ? "ვიდეო" : "პოსტერი"} ${slot + 1}`
  const hour = formatHour(publishHour(kind, slot))

  async function pickFile(file: File) {
    setError(null)
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("ატვირთე JPEG, PNG ან WebP სურათი.")
      return
    }
    setBusy("upload")
    try {
      const extension = file.type.split("/")[1] ?? "jpg"
      const blob = await upload(
        `daily/start/${day}-video-${slot + 1}.${extension}`,
        file,
        {
          access: "public",
          handleUploadUrl: "/api/daily/upload",
          contentType: file.type,
        }
      )
      setImage({ url: blob.url, bytes: file.size })
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "სურათი ვერ აიტვირთა."
      )
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setBusy("save")
    setError(null)
    const result = await savePlanItem({
      day,
      kind,
      slot,
      prompt,
      caption,
      startImageUrl: image?.url ?? null,
      startImageBytes: image?.bytes ?? 0,
    })
    setBusy(null)
    if (!result.ok) setError(result.error)
    else onChanged()
  }

  async function clear() {
    if (!item) {
      setPrompt("")
      setCaption("")
      setImage(null)
      return
    }
    if (!window.confirm(`${title}: წავშალო ეს სლოტი და მისი ფაილები?`)) return
    setBusy("clear")
    const result = await clearPlanItem(item.id)
    setBusy(null)
    if (!result.ok) setError(result.error)
    else onChanged()
  }

  async function retry(kindOfRetry: "generation" | "publish") {
    if (!item) return
    setBusy("retry")
    const result =
      kindOfRetry === "generation"
        ? await retryGeneration(item.id)
        : await retryPublish(item.id)
    setBusy(null)
    if (!result.ok) setError(result.error)
    else onChanged()
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-heading text-base font-semibold">{title}</h3>
          {autoPublish ? (
            <p className="text-xs text-muted-foreground">გამოქვეყნება {hour}-ზე</p>
          ) : null}
        </div>
        {item ? <StatusBadge item={item} autoPublish={autoPublish} /> : null}
      </header>

      {item?.status === "ready" && item.resultUrl ? (
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              "overflow-hidden rounded-xl bg-muted",
              kind === "video" ? "mx-auto aspect-[9/16] w-full max-w-56" : "aspect-square"
            )}
          >
            {kind === "video" ? (
              <video
                src={item.resultUrl}
                controls
                playsInline
                preload="metadata"
                className="size-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.resultUrl} alt={title} className="size-full object-cover" />
            )}
          </div>
          <a
            href={`${item.resultUrl}?download=1`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted"
          >
            <Download className="size-4" /> ჩამოტვირთვა
          </a>
        </div>
      ) : null}

      {kind === "video" ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className="relative flex aspect-[9/16] w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted text-muted-foreground hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label={image ? "Start image-ის შეცვლა" : "Start image-ის ატვირთვა"}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.url} alt="" className="size-full object-cover" />
            ) : busy === "upload" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ImagePlus className="size-5" />
            )}
          </button>
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Start image</p>
            <p>პერსონაჟის ფოტო, 9:16. დააჭირე ასატვირთად ან შესაცვლელად.</p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void pickFile(file)
            }}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${fieldId}-prompt`} className="text-xs font-medium">
          {kind === "video" ? "ვიდეოს პრომტი (მოქმედება და ტექსტი)" : "პოსტერის პრომტი"}
        </label>
        <textarea
          id={`${fieldId}-prompt`}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
          maxLength={5000}
          className="resize-y rounded-lg border border-input bg-input/30 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${fieldId}-caption`} className="text-xs font-medium">
          {autoPublish ? "Caption (Facebook / Instagram)" : "Caption (შენთვის, ხელით დასაპოსტად)"}
        </label>
        <textarea
          id={`${fieldId}-caption`}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          rows={2}
          maxLength={2200}
          className="resize-y rounded-lg border border-input bg-input/30 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {item?.error ? (
        <p className="rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive">
          {item.error}
          {item.status !== "failed" && item.attempts > 0 ? " ხელახლა ვცდი…" : ""}
        </p>
      ) : null}
      {item?.publishError ? (
        <p className="rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive">
          {item.publishError}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {dirty && incomplete ? (
        <p className="text-xs text-muted-foreground">
          {kind === "video"
            ? "გენერაციისთვის საჭიროა პრომტიც და start image-იც."
            : "გენერაციისთვის საჭიროა პრომტი."}
        </p>
      ) : null}

      <footer className="mt-auto flex flex-wrap gap-2">
        <Button onClick={save} disabled={!dirty || busy !== null}>
          {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
          შენახვა
        </Button>
        {item?.status === "failed" ? (
          <Button variant="secondary" onClick={() => retry("generation")} disabled={busy !== null}>
            <RotateCcw /> თავიდან გენერაცია
          </Button>
        ) : null}
        {item && autoPublish && (item.publishStatus === "failed" || item.publishStatus === "partial") ? (
          <Button variant="secondary" onClick={() => retry("publish")} disabled={busy !== null}>
            <RotateCcw /> თავიდან გამოქვეყნება
          </Button>
        ) : null}
        {item || prompt || caption || image ? (
          <Button
            variant="ghost"
            onClick={clear}
            disabled={busy !== null}
            aria-label={`${title}: გასუფთავება`}
          >
            <Trash2 /> გასუფთავება
          </Button>
        ) : null}
      </footer>
    </article>
  )
}

function StatusBadge({
  item,
  autoPublish,
}: {
  item: DailyItem
  autoPublish: boolean
}) {
  const showPublish = autoPublish && item.status === "ready"
  const text = showPublish ? PUBLISH_LABEL[item.publishStatus] : GEN_LABEL[item.status]
  const tone =
    item.status === "failed" ||
    (showPublish &&
      (item.publishStatus === "failed" || item.publishStatus === "partial"))
      ? "bg-destructive/15 text-destructive"
      : item.status === "ready" && (!showPublish || item.publishStatus === "published")
        ? "bg-primary/15 text-primary"
        : item.status === "ready"
          ? "bg-secondary text-secondary-foreground"
          : "bg-muted text-muted-foreground"
  return (
    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", tone)}>
      {text}
    </span>
  )
}
