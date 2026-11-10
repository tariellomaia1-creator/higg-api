"use client"

import { uploadPresigned } from "@vercel/blob/client"
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ImagePlus,
  Loader2,
  X,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  POSTERS_PER_DAY,
  VIDEOS_PER_DAY,
  addDays,
  isDay,
  tbilisiNow,
} from "@/daily/config"
import type { ItemKind } from "@/daily/config"
import { getTakenSlots, savePlanItem } from "@/daily/actions"
import { parseBlocks } from "@/daily/blocks"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Photo = { id: string; file: File; preview: string }

type Row = {
  day: string
  video?: { photo?: Photo; prompt?: string; caption: string; slot: number }
  poster?: { prompt: string; caption: string; slot: number }
}

type RowState = "idle" | "working" | "done" | "error"

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"]
const SEARCH_DAYS = 400

/** "img2.jpg" before "img10.jpg". */
function byFileName(a: Photo, b: Photo): number {
  return a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: "base" })
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat("ka-GE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`))
}

/** Next free days for `count` items of one kind, starting at `start`: one
    item per day, in the first free slot of that day. */
function freeDays(
  start: string,
  count: number,
  kind: ItemKind,
  taken: Set<string>
): Array<{ day: string; slot: number }> {
  const perDay = kind === "video" ? VIDEOS_PER_DAY : POSTERS_PER_DAY
  const days: Array<{ day: string; slot: number }> = []
  let day = start
  for (let guard = 0; days.length < count && guard < SEARCH_DAYS; guard++) {
    const slot = Array.from({ length: perDay }, (_, i) => i).find(
      (i) => !taken.has(`${day}|${kind}|${i}`)
    )
    if (slot !== undefined) days.push({ day, slot })
    day = addDays(day, 1)
  }
  return days
}

export function BatchPlanner() {
  const today = tbilisiNow().day
  const [start, setStart] = useState(() => addDays(today, 1))
  const [photos, setPhotos] = useState<Photo[]>([])
  const [videoPrompts, setVideoPrompts] = useState("")
  const [videoCaptions, setVideoCaptions] = useState("")
  const [posterPrompts, setPosterPrompts] = useState("")
  const [posterCaptions, setPosterCaptions] = useState("")
  const [taken, setTaken] = useState<Set<string> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rowState, setRowState] = useState<Record<string, { state: RowState; error?: string }>>({})
  const [running, setRunning] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Which days already have plans, so the batch only fills free ones.
  useEffect(() => {
    let live = true
    void getTakenSlots(start, SEARCH_DAYS).then((result) => {
      if (!live) return
      if (!result.ok) {
        setLoadError(result.error)
        return
      }
      setLoadError(null)
      setTaken(new Set(result.data.map((s) => `${s.day}|${s.kind}|${s.slot}`)))
    })
    return () => {
      live = false
    }
  }, [start])

  // Release preview URLs when leaving the page.
  const previews = useRef<Photo[]>([])
  useEffect(() => {
    previews.current = photos
  }, [photos])
  useEffect(() => () => previews.current.forEach((photo) => URL.revokeObjectURL(photo.preview)), [])

  function addFiles(list: FileList | null) {
    if (!list) return
    const next = Array.from(list)
      .filter((file) => ACCEPTED.includes(file.type))
      .map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: URL.createObjectURL(file),
      }))
    setPhotos((current) => [...current, ...next].sort(byFileName))
  }

  function move(index: number, delta: number) {
    setPhotos((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const copy = [...current]
      const [item] = copy.splice(index, 1)
      copy.splice(target, 0, item!)
      return copy
    })
  }

  function remove(index: number) {
    setPhotos((current) => {
      const gone = current[index]
      if (gone) URL.revokeObjectURL(gone.preview)
      return current.filter((_, i) => i !== index)
    })
  }

  const vPrompts = useMemo(() => parseBlocks(videoPrompts), [videoPrompts])
  const vCaptions = useMemo(() => parseBlocks(videoCaptions), [videoCaptions])
  const pPrompts = useMemo(() => parseBlocks(posterPrompts), [posterPrompts])
  const pCaptions = useMemo(() => parseBlocks(posterCaptions), [posterCaptions])

  const videoCount = Math.max(photos.length, vPrompts.length)
  const completeVideos = Math.min(photos.length, vPrompts.length)

  const rows = useMemo<Row[]>(() => {
    if (!taken) return []
    const vDays = freeDays(start, videoCount, "video", taken)
    const pDays = freeDays(start, pPrompts.length, "poster", taken)
    const byDay = new Map<string, Row>()
    const row = (day: string) => {
      const existing = byDay.get(day) ?? { day }
      byDay.set(day, existing)
      return existing
    }
    vDays.forEach(({ day, slot }, index) => {
      row(day).video = {
        ...(photos[index] ? { photo: photos[index] } : {}),
        ...(vPrompts[index] ? { prompt: vPrompts[index] } : {}),
        caption: vCaptions[index] ?? "",
        slot,
      }
    })
    pDays.forEach(({ day, slot }, index) => {
      row(day).poster = { prompt: pPrompts[index]!, caption: pCaptions[index] ?? "", slot }
    })
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
  }, [taken, start, videoCount, pPrompts, photos, vPrompts, vCaptions, pCaptions])

  const skipped = useMemo(() => {
    if (!taken || rows.length === 0) return 0
    const last = rows[rows.length - 1]!.day
    let count = 0
    for (let day = start; day <= last; day = addDays(day, 1))
      if (!rows.some((row) => row.day === day)) count++
    return count
  }, [rows, taken, start])

  const warnings: string[] = []
  if (photos.length !== vPrompts.length && (photos.length || vPrompts.length))
    warnings.push(
      `ფოტო ${photos.length}, ვიდეოს პრომტი ${vPrompts.length}: დაიგეგმება მხოლოდ ${completeVideos} სრული წყვილი.`
    )
  if (vCaptions.length > vPrompts.length)
    warnings.push(`ვიდეოს caption მეტია (${vCaptions.length}) ვიდრე პრომტი (${vPrompts.length}).`)
  if (pCaptions.length > pPrompts.length)
    warnings.push(`პოსტერის caption მეტია (${pCaptions.length}) ვიდრე პრომტი (${pPrompts.length}).`)

  const plannable = rows.reduce(
    (sum, row) =>
      sum + (row.video?.photo && row.video.prompt ? 1 : 0) + (row.poster ? 1 : 0),
    0
  )
  const finished = Object.values(rowState).filter((s) => s.state === "done").length

  function mark(key: string, state: RowState, error?: string) {
    setRowState((current) => ({ ...current, [key]: { state, ...(error ? { error } : {}) } }))
  }

  async function schedule() {
    setRunning(true)
    setRowState({})
    for (const row of rows) {
      if (row.video?.photo && row.video.prompt) {
        const key = `${row.day}|video`
        mark(key, "working")
        try {
          const file = row.video.photo.file
          const extension = file.type.split("/")[1] ?? "jpg"
          const blob = await uploadPresigned(`daily/start/${row.day}-video-${row.video.slot + 1}.${extension}`, file, {
            access: "public",
            handleUploadUrl: "/api/daily/upload",
            contentType: file.type,
          })
          const saved = await savePlanItem({
            day: row.day,
            kind: "video",
            slot: row.video.slot,
            prompt: row.video.prompt,
            caption: row.video.caption,
            startImageUrl: blob.url,
            startImageBytes: file.size,
          })
          if (saved.ok) mark(key, "done")
          else mark(key, "error", saved.error)
        } catch (caught) {
          mark(key, "error", caught instanceof Error ? caught.message : "ატვირთვა ვერ მოხერხდა.")
        }
      }
      if (row.poster) {
        const key = `${row.day}|poster`
        mark(key, "working")
        const saved = await savePlanItem({
          day: row.day,
          kind: "poster",
          slot: row.poster.slot,
          prompt: row.poster.prompt,
          caption: row.poster.caption,
          startImageUrl: null,
          startImageBytes: 0,
        })
        if (saved.ok) mark(key, "done")
        else mark(key, "error", saved.error)
      }
    }
    setRunning(false)
    // Refresh which days are taken now.
    const result = await getTakenSlots(start, SEARCH_DAYS)
    if (result.ok) setTaken(new Set(result.data.map((s) => `${s.day}|${s.kind}|${s.slot}`)))
  }

  const allDone = !running && plannable > 0 && finished === plannable

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> დღის გეგმა
        </Link>
        <h1 className="font-heading text-2xl font-semibold">Batch დაგეგმვა</h1>
        <p className="text-sm text-muted-foreground">
          ატვირთე ბევრი ფოტო და ჩასვი პრომტები. რიგითობით შევუსაბამებ (ფოტო 1 → პრომტი 1 → პირველი თავისუფალი დღე) და დღეებად დავყოფ.
          უკვე შევსებულ დღეებს არ ვეხები.
        </p>
      </div>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium">დაწყების დღე</span>
          <input
            type="date"
            value={start}
            min={today}
            onChange={(event) => {
              if (isDay(event.target.value)) setStart(event.target.value)
            }}
            className="h-9 rounded-lg border border-input bg-input/30 px-2 text-sm [color-scheme:dark]"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          დღეში {VIDEOS_PER_DAY} ვიდეო და {POSTERS_PER_DAY} პოსტერი. ვიდეოები და პოსტერები თავ-თავის თავისუფალ დღეებს ავსებს.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-heading text-lg font-semibold">ვიდეოები</h2>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              addFiles(event.dataTransfer.files)
            }}
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-center text-sm"
          >
            <ImagePlus className="size-6 text-muted-foreground" />
            <p>ჩააგდე start image-ები აქ ან</p>
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              ფოტოების არჩევა
            </Button>
            <p className="text-xs text-muted-foreground">
              რიგდება ფაილის სახელით (1, 2, … 10). თანმიმდევრობა ისრებით შეცვალე.
            </p>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPTED.join(",")}
              className="hidden"
              onChange={(event) => {
                addFiles(event.target.files)
                event.target.value = ""
              }}
            />
          </div>
          {photos.length ? (
            <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo, index) => (
                <li key={photo.id} className="relative overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.preview} alt={photo.file.name} className="aspect-[9/16] w-full object-cover" />
                  <span className="absolute top-1 left-1 rounded-full bg-black/70 px-1.5 text-xs text-white">
                    {index + 1}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 p-0.5">
                    <button type="button" className="rounded p-1 text-white hover:bg-white/20" onClick={() => move(index, -1)} aria-label="წინ">
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button type="button" className="rounded p-1 text-white hover:bg-white/20" onClick={() => move(index, 1)} aria-label="უკან">
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button type="button" className="rounded p-1 text-white hover:bg-white/20" onClick={() => remove(index)} aria-label="წაშლა">
                      <X className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          <BlocksField
            label={`ვიდეოს პრომტები (${vPrompts.length})`}
            value={videoPrompts}
            onChange={setVideoPrompts}
            placeholder={"პრომტი 1…\n---\nპრომტი 2…\n---\nპრომტი 3…"}
          />
          <BlocksField
            label={`ვიდეოს caption-ები, არასავალდებულო (${vCaptions.length})`}
            value={videoCaptions}
            onChange={setVideoCaptions}
            rows={3}
          />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-heading text-lg font-semibold">პოსტერები</h2>
          <BlocksField
            label={`პოსტერის პრომტები (${pPrompts.length})`}
            value={posterPrompts}
            onChange={setPosterPrompts}
            rows={10}
            placeholder={"პრომტი 1…\n---\nპრომტი 2…"}
          />
          <BlocksField
            label={`პოსტერის caption-ები, არასავალდებულო (${pCaptions.length})`}
            value={posterCaptions}
            onChange={setPosterCaptions}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            პრომტები ერთმანეთისგან გამოყავი ცალკე ხაზით, რომელზეც მხოლოდ <code>---</code> წერია. თუ <code>---</code> არ გამოიყენე, ყოველი ხაზი ცალკე პრომტად ჩაითვლება.
          </p>
        </section>
      </div>

      {loadError ? (
        <p role="alert" className="rounded-xl bg-destructive/15 px-4 py-3 text-sm text-destructive">{loadError}</p>
      ) : null}
      {warnings.map((warning) => (
        <p key={warning} className="flex items-start gap-2 rounded-xl bg-muted px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /> {warning}
        </p>
      ))}

      {rows.length ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">
              გეგმა: {rows.length} დღე, {plannable} გენერაცია
              {skipped ? <span className="text-sm font-normal text-muted-foreground"> · {skipped} დაკავებული დღე გამოტოვებულია</span> : null}
            </h2>
            {allDone ? (
              <Link href="/" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
                <CheckCircle2 className="size-4" /> დაიგეგმა. გადადი დღის გეგმაზე
              </Link>
            ) : (
              <Button size="lg" onClick={schedule} disabled={running || plannable === 0}>
                {running ? <Loader2 className="animate-spin" /> : null}
                {running ? `იგეგმება… ${finished}/${plannable}` : `დაგეგმვა (${plannable})`}
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">დღე</th>
                  <th className="px-3 py-2">ვიდეო</th>
                  <th className="px-3 py-2">პოსტერი</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.day} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <p className="font-medium capitalize">{formatDay(row.day)}</p>
                      <p className="text-xs text-muted-foreground">{row.day}</p>
                    </td>
                    <td className="px-3 py-2">
                      {row.video ? (
                        <div className="flex gap-2">
                          {row.video.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.video.photo.preview} alt="" className="aspect-[9/16] w-10 shrink-0 rounded object-cover" />
                          ) : (
                            <span className="flex aspect-[9/16] w-10 shrink-0 items-center justify-center rounded bg-destructive/15 text-[10px] text-destructive">ფოტო?</span>
                          )}
                          <div className="min-w-0">
                            <p className={cn("line-clamp-2", !row.video.prompt && "text-destructive")}>
                              {row.video.prompt ?? "პრომტი აკლია"}
                            </p>
                            <RowStatus value={rowState[`${row.day}|video`]} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.poster ? (
                        <div className="min-w-0">
                          <p className="line-clamp-2">{row.poster.prompt}</p>
                          <RowStatus value={rowState[`${row.day}|poster`]} />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : taken === null && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> იტვირთება…
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">ატვირთე ფოტოები ან ჩასვი პრომტები და აქ გამოჩნდება, რომელ დღეს რა მოხვდება.</p>
      )}
    </main>
  )
}

function BlocksField({
  label,
  value,
  onChange,
  rows = 8,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="resize-y rounded-lg border border-input bg-input/30 px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </label>
  )
}

function RowStatus({ value }: { value: { state: RowState; error?: string } | undefined }) {
  if (!value || value.state === "idle") return null
  if (value.state === "working")
    return (
      <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> ინახება…
      </p>
    )
  if (value.state === "done")
    return (
      <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
        <CheckCircle2 className="size-3" /> დაიგეგმა
      </p>
    )
  return <p className="mt-1 text-xs text-destructive">{value.error}</p>
}
