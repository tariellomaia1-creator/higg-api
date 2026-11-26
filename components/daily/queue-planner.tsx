"use client"

import {
  AlertTriangle,
  CalendarClock,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Clock,
  Film,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Send,
  Trash2,
  Upload,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

import type { ChannelInfo } from "@/daily/channels"
import type { QueueChannel, QueueItem } from "@/daily/db"
import {
  addQueueFiles,
  applyQueueCaptions,
  getQueueView,
  moveQueueItem,
  publishQueueItemNow,
  queueMediaLink,
  redistributeQueueCaptions,
  refreshQueuePublishing,
  removeUnreachableQueueItems,
  removeQueueItem,
  retryQueueItem,
  saveQueueCaption,
  saveQueueCaptionVariants,
  saveQueueChannels,
  saveQueueSettings,
  setQueueItemBadge,
} from "@/daily/queue-actions"
import type { QueueView } from "@/daily/queue-actions"
import { kindAt, parseTimes } from "@/daily/queue-schedule"
import type { SlotKind } from "@/daily/queue-schedule"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { uploadStoredFile } from "./upload-file"


const ACCEPTED = ["video/mp4", "video/quicktime", "image/jpeg", "image/png", "image/webp"]

const STATUS: Record<QueueItem["status"], { label: string; tone: string }> = {
  queued: { label: "რიგში", tone: "bg-muted text-muted-foreground" },
  publishing: { label: "ქვეყნდება…", tone: "bg-secondary text-secondary-foreground" },
  published: { label: "გამოქვეყნდა", tone: "bg-primary/15 text-primary" },
  partial: { label: "ნაწილობრივ", tone: "bg-destructive/15 text-destructive" },
  failed: { label: "ვერ გამოქვეყნდა", tone: "bg-destructive/15 text-destructive" },
}

function formatWhen(iso: string | null): string {
  if (!iso) return "დრო არ აქვს"
  return new Intl.DateTimeFormat("ka-GE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tbilisi",
  }).format(new Date(iso))
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

function minutesAgo(iso: string | null): number | null {
  if (!iso) return null
  return Math.round((Date.now() - Date.parse(iso)) / 60_000)
}

/** "clip2.mp4" before "clip10.mp4". */
function byName(a: File, b: File): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
}

/** Page address of a channel's queue. */
export function channelHref(id: QueueChannel): string {
  if (id === "fb") return "/queue"
  if (id === "ig") return "/queue/instagram"
  return `/queue/c/${id}`
}

function channelIntro(channel: ChannelInfo): string {
  return channel.platform === "instagram"
    ? `${channel.label}: ცალკე რიგი, თავისი საათებით. ვიდეოები Reels-ად, სურათები ფოტო-პოსტად.`
    : `${channel.label}: ატვირთე მზა ვიდეოები და სურათები და ისინი რიგ-რიგობით გამოქვეყნდება ამ გვერდზე, დაყენებულ საათებში.`
}

export function QueuePlanner({ channel }: { channel: QueueChannel }) {
  const [view, setView] = useState<QueueView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [upload, setUpload] = useState<{ done: number; total: number; percent: number } | null>(null)
  const [bulk, setBulk] = useState("")
  /** Extra channels an upload also goes to; null = the default (the same
      page's other channel, e.g. its Instagram). */
  const [chosenTargets, setChosenTargets] = useState<string[] | null>(null)
  const siblings = view
    ? view.channels.filter((entry) => entry.id !== view.channel && entry.pageId && entry.pageId === view.current.pageId)
    : []
  const targets = chosenTargets ?? siblings.map((entry) => entry.id)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const result = await getQueueView(channel)
    if (result.ok) {
      setView(result.data)
      setError(null)
    } else setError(result.error)
  }, [channel])

  useEffect(() => {
    let live = true
    void getQueueView(channel).then((result) => {
      if (!live) return
      if (result.ok) setView(result.data)
      else setError(result.error)
    })
    return () => {
      live = false
    }
  }, [channel])

  const publishing = view?.items.some((item) => item.status === "publishing")
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        void (async () => {
          if (publishing) await refreshQueuePublishing()
          await load()
        })()
      },
      publishing ? 15_000 : 60_000
    )
    return () => window.clearInterval(timer)
  }, [publishing, load])

  async function addFiles(list: FileList | null) {
    if (!list) return
    const files = Array.from(list)
      .filter((file) => ACCEPTED.includes(file.type))
      .sort(byName)
    if (files.length === 0) {
      setError("აირჩიე MP4/MOV ვიდეო ან JPEG/PNG/WebP სურათი.")
      return
    }
    setError(null)
    setNotice(null)
    const uploaded: Array<{ url: string; mediaType: string; bytes: number; fileName: string }> = []
    for (const [index, file] of files.entries()) {
      setUpload({ done: index, total: files.length, percent: 0 })
      try {
        const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80)
        const url = await uploadStoredFile(`daily/queue/${safeName}`, file, (percent) =>
          setUpload({ done: index, total: files.length, percent })
        )
        uploaded.push({ url, mediaType: file.type, bytes: file.size, fileName: file.name })
      } catch (caught) {
        setError(`${file.name}: ${caught instanceof Error ? caught.message : "ატვირთვა ვერ მოხერხდა."}`)
      }
    }
    if (uploaded.length) {
      const result = await addQueueFiles(channel, uploaded, targets)
      if (!result.ok) setError(result.error)
      else {
        const names = [view?.current.label, ...(view?.channels ?? []).filter((entry) => targets.includes(entry.id)).map((entry) => entry.label)]
        setNotice(`${result.data} ფაილი დაემატა: ${names.filter(Boolean).join(", ")}.`)
      }
    }
    setUpload(null)
    await load()
  }

  async function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    const result = await run()
    if (!result.ok && result.error) setError(result.error)
    await load()
  }

  const items = view?.items ?? []
  const waiting = items.filter((item) => item.status !== "published")
  const done = items.filter((item) => item.status === "published")
  const lastTick = minutesAgo(view?.lastTickAt ?? null)
  const cronOk = lastTick !== null && lastTick <= 15

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> დღის გეგმა
        </Link>
        <h1 className="font-heading text-2xl font-semibold">Auto posting</h1>
        <nav aria-label="არხი" className="mt-3 flex flex-wrap gap-1 rounded-xl bg-muted p-1 sm:w-fit">
          {(view?.channels ?? []).map((entry) => (
            <Link
              key={entry.id}
              href={channelHref(entry.id)}
              aria-current={entry.id === channel ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                entry.id === channel && "bg-background text-foreground shadow-sm",
                !entry.connected && "opacity-60"
              )}
            >
              {entry.label}
            </Link>
          ))}
        </nav>
        {view ? <p className="mt-3 text-sm text-muted-foreground">{channelIntro(view.current)}</p> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/15 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : null}
      {notice ? <p role="status" className="rounded-xl bg-muted px-4 py-3 text-sm">{notice}</p> : null}

      {view ? (
        <>
          {view.unreachable ? (
            <section role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <p className="flex-1">
                რიგში {view.unreachable} ფაილი ძველ საცავშია (Vercel) და ამ სერვერიდან აღარ იკითხება. მოხსენი რიგიდან და
                თავიდან ატვირთე.
              </p>
              <Button
                variant="destructive"
                onClick={() =>
                  void act(async () => {
                    const result = await removeUnreachableQueueItems()
                    if (result.ok) setNotice(`რიგიდან მოიხსნა ${result.data} ძველი ფაილი.`)
                    return result
                  })
                }
              >
                მოხსნა
              </Button>
            </section>
          ) : null}
          <SupplyPanel items={waiting} />
          <TokenPanel tokens={view.tokens} />
          <StatusStrip view={view} cronOk={cronOk} lastTick={lastTick} />
          <PagesPanel key={view.channels.map((entry) => entry.id).join(",")} view={view} onAct={act} onNotice={setNotice} />
          <SettingsPanel view={view} onSaved={load} onError={setError} />

          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold">ატვირთვა</h2>
            {view.channels.length > 1 ? (
              <fieldset className="flex flex-col gap-1.5 text-sm">
                <legend className="mb-1 text-xs text-muted-foreground">
                  ატვირთული ფაილები ამ რიგთან ერთად სად დაემატოს (ერთი ატვირთვა, თითო არხს თავისი საათი და caption)
                </legend>
                {view.channels
                  .filter((entry) => entry.id !== channel)
                  .map((entry) => (
                    <label key={entry.id} className="flex items-center gap-2">
                      <input
                        id={`upload-target-${entry.id}`}
                        type="checkbox"
                        checked={targets.includes(entry.id)}
                        onChange={(event) =>
                          setChosenTargets(
                            event.target.checked
                              ? [...targets, entry.id]
                              : targets.filter((id) => id !== entry.id)
                          )
                        }
                      />
                      {entry.label}
                    </label>
                  ))}
              </fieldset>
            ) : null}
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                void addFiles(event.dataTransfer.files)
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm"
            >
              <Upload className="size-6 text-muted-foreground" />
              <p>ჩააგდე ვიდეოები/სურათები აქ, ან</p>
              <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={upload !== null}>
                ფაილების არჩევა
              </Button>
              <p className="text-xs text-muted-foreground">
                MP4/MOV ვიდეო (Reels-ისთვის 9:16), JPEG/PNG სურათი. რიგში ჩადგება ფაილის სახელის მიხედვით (1, 2, … 10).
              </p>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={ACCEPTED.join(",")}
                className="hidden"
                onChange={(event) => {
                  void addFiles(event.target.files)
                  event.target.value = ""
                }}
              />
            </div>
            {upload ? (
              <div className="flex flex-col gap-1 text-sm" role="status">
                <span>
                  იტვირთება {upload.done + 1}/{upload.total}… {upload.percent}%
                </span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${((upload.done + upload.percent / 100) / upload.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}
          </section>

          <CaptionVariantsPanel
            key={view.captionVariants}
            channel={channel}
            initial={view.captionVariants}
            waitingCount={waiting.length}
            onAct={act}
            onNotice={setNotice}
          />

          {waiting.length ? (
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
              <h2 className="font-heading text-lg font-semibold">caption-ები ერთად</h2>
              <p className="text-xs text-muted-foreground">
                ჩასვი caption-ები `---`-ით გამოყოფილი. რიგში მდგომებს მიენიჭება თანმიმდევრობით (1-ლი → პირველს და ა.შ.).
                ცარიელ ველს გამოქვეყნებისას ნაგულისხმევი caption ჩაენაცვლება.
              </p>
              <textarea
                id="bulk-captions"
                value={bulk}
                onChange={(event) => setBulk(event.target.value)}
                rows={6}
                placeholder={"პირველი ვიდეოს caption…\n---\nმეორე ვიდეოს caption…"}
                className="resize-y rounded-lg border border-input bg-input/30 px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    void act(async () => {
                      const result = await applyQueueCaptions(channel, bulk, true)
                      if (result.ok) setNotice(`caption მიენიჭა ${result.data} ფაილს (ცარიელებს).`)
                      return result
                    })
                  }
                  disabled={!bulk.trim()}
                >
                  ცარიელებს მინიჭება
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void act(async () => {
                      const result = await applyQueueCaptions(channel, bulk, false)
                      if (result.ok) setNotice(`caption მიენიჭა ${result.data} ფაილს.`)
                      return result
                    })
                  }
                  disabled={!bulk.trim()}
                >
                  ყველას გადაწერა რიგით
                </Button>
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-lg font-semibold">რიგი · {waiting.length}</h2>
            {waiting.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                რიგი ცარიელია. ატვირთე ვიდეოები ზემოთ და აქ გამოჩნდება, რომელი როდის გამოქვეყნდება.
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                {waiting.map((item, index) => (
                  <QueueRow
                    key={`${item.id}-${item.caption.length}`}
                    item={item}
                    index={index}
                    count={waiting.length}
                    canPublish={view.current.connected}
                    badge={view.current.badge}
                    onAct={act}
                  />
                ))}
              </ol>
            )}
          </section>

          {done.length ? (
            <details className="rounded-2xl border border-border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-medium">გამოქვეყნებული · {done.length}</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {done.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                    <CheckCircle2 className="size-4 text-primary" />
                    <span className="min-w-0 truncate">{item.fileName || "ფაილი"}</span>
                    <span className="text-xs text-muted-foreground">{formatWhen(item.publishedAt)}</span>
                    {item.fbPostId ? (
                      <a
                        href={`https://www.facebook.com/${item.fbPostId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline"
                      >
                        Facebook
                      </a>
                    ) : null}
                    {item.igMediaId ? <span className="text-xs text-muted-foreground">Instagram ✓</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : !error ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> იტვირთება…
        </p>
      ) : null}
    </main>
  )
}

const DAY_MS = 24 * 60 * 60 * 1000

function formatDay(ms: number): string {
  return new Intl.DateTimeFormat("ka-GE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Tbilisi",
  }).format(new Date(ms))
}

/** How long the uploaded files last at the current times, and by when to
    upload more (a day before the last one goes out). */
function SupplyPanel({ items }: { items: QueueItem[] }) {
  const queued = items.filter((item) => item.status === "queued" && item.scheduledAt)
  const videos = queued.filter((item) => item.kind === "video").length
  const images = queued.length - videos
  const [now] = useState(() => Date.now())
  if (queued.length === 0)
    return (
      <section role="status" className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div>
          <p className="font-medium text-destructive">მასალა არ არის: რიგი ცარიელია</p>
          <p className="text-muted-foreground">ატვირთე ახალი ვიდეოები/ფოტოები ახლავე, თორემ პოსტები შეჩერდება.</p>
        </div>
      </section>
    )
  const last = Math.max(...queued.map((item) => Date.parse(item.scheduledAt!)))
  const days = Math.max(1, Math.ceil((last - now) / DAY_MS))
  const uploadBy = last - DAY_MS
  const urgent = uploadBy - now < DAY_MS
  return (
    <section
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 text-sm",
        urgent ? "border-destructive/40 bg-destructive/10" : "border-border bg-card"
      )}
    >
      <CalendarClock className={cn("mt-0.5 size-5 shrink-0", urgent ? "text-destructive" : "text-primary")} />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">
          მასალა ეყოფა <span className="tabular-nums">{days}</span> დღეს · {queued.length} პოსტი ({videos} ვიდეო,{" "}
          {images} ფოტო)
        </p>
        <p className="text-muted-foreground">ბოლო პოსტი: {formatWhen(new Date(last).toISOString())}</p>
        <p className={cn(urgent ? "font-medium text-destructive" : "text-foreground")}>
          {urgent ? "ახალი მასალა ატვირთე დღესვე." : `ახალი მასალა ატვირთე ${formatDay(uploadBy)}-მდე.`}
        </p>
      </div>
    </section>
  )
}

function CaptionVariantsPanel({
  channel,
  initial,
  waitingCount,
  onAct,
  onNotice,
}: {
  channel: QueueChannel
  initial: string
  waitingCount: number
  onAct: (run: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>
  onNotice: (message: string) => void
}) {
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const count = text.split(/^\s*---\s*$/m).filter((block) => block.trim()).length

  async function run(task: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    await onAct(task)
    setBusy(false)
  }

  return (
    <details className="rounded-2xl border border-border bg-card p-4 text-sm">
      <summary className="cursor-pointer font-heading text-lg font-semibold">
        caption-ის ვარიანტები · {count}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          ყოველ ატვირთულ ფაილს რიგრიგობით ერთ-ერთი ვარიანტი მიენიჭება, ასე რომ მეზობელი პოსტები არ განმეორდება.
          ვარიანტები გამოყავი `---` ხაზით. სია ორივე არხისთვის საერთოა (Instagram სიის შუიდან იწყებს).
        </p>
        <textarea
          id="caption-variants"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={14}
          className="resize-y rounded-lg border border-input bg-input/30 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || count === 0}
            onClick={() =>
              void run(async () => {
                const result = await saveQueueCaptionVariants(channel, text)
                if (result.ok) onNotice(`შენახულია ${result.data} ვარიანტი.`)
                return result
              })
            }
          >
            ვარიანტების შენახვა
          </Button>
          {waitingCount ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await redistributeQueueCaptions(channel, false)
                  if (result.ok) onNotice(`რიგში მდგომ ${result.data} ფაილს სხვადასხვა caption მიენიჭა.`)
                  return result
                })
              }
            >
              რიგს თავიდან განაწილება
            </Button>
          ) : null}
        </div>
      </div>
    </details>
  )
}

/** When the Meta tokens stop working; red in the last week or once invalid,
    with how to renew. */
function TokenPanel({ tokens }: { tokens: QueueView["tokens"] }) {
  const [now] = useState(() => Date.now())
  if (tokens.length === 0) return null
  const rows = tokens.map((token) => {
    const days = token.expiresAt ? Math.floor((Date.parse(token.expiresAt) - now) / DAY_MS) : null
    const urgent = !token.valid || (days !== null && days <= 7)
    const text = !token.valid
      ? `აღარ მუშაობს${token.error ? `: ${token.error}` : ""}`
      : days === null
        ? "უვადოა ✓"
        : days <= 0
          ? "იწურება დღეს"
          : `იწურება ${days} დღეში (${formatDay(Date.parse(token.expiresAt!))})`
    return { ...token, urgent, text }
  })
  const urgent = rows.some((row) => row.urgent)
  return (
    <section
      role="status"
      className={cn(
        "flex flex-col gap-1 rounded-2xl border p-4 text-sm",
        urgent ? "border-destructive/40 bg-destructive/10" : "border-border bg-card"
      )}
    >
      {rows.map((row) => (
        <p key={row.variable} className={cn(row.urgent && "font-medium text-destructive")}>
          <span className="text-muted-foreground">Meta token</span> <code className="text-xs">{row.variable}</code>: {row.text}
        </p>
      ))}
      {urgent ? (
        <p className="text-xs text-muted-foreground">
          განახლება: Graph API Explorer → Generate Access Token → ⓘ → Extend Access Token → ჩასვი Vercel-ში იმავე
          ცვლადში → Redeploy.
        </p>
      ) : null}
    </section>
  )
}

/** Other Facebook Pages (and their Instagram accounts) the Meta user token
    can post to; ticked ones get their own queue tab. */
function PagesPanel({
  view,
  onAct,
  onNotice,
}: {
  view: QueueView
  onAct: (run: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>
  onNotice: (message: string) => void
}) {
  const active = view.channels.filter((entry) => entry.id !== "fb" && entry.id !== "ig").map((entry) => entry.id)
  const [picked, setPicked] = useState<string[]>(active)
  const [busy, setBusy] = useState(false)
  const changed = picked.slice().sort().join() !== active.slice().sort().join()

  function toggle(id: string, on: boolean) {
    setPicked((current) => (on ? [...current, id] : current.filter((entry) => entry !== id)))
  }

  return (
    <details className="rounded-2xl border border-border bg-card p-4 text-sm">
      <summary className="cursor-pointer font-heading text-lg font-semibold">
        სხვა გვერდები · {active.length}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {!view.pages.configured ? (
          <p className="text-muted-foreground">
            სხვა გვერდებზე პოსტვისთვის Vercel-ში დაამატე <code>META_USER_ACCESS_TOKEN</code> (Meta-ს მომხმარებლის token,
            pages_show_list, pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish
            უფლებებით) და გადატვირთე საიტი.
          </p>
        ) : view.pages.error ? (
          <p className="text-destructive">{view.pages.error}</p>
        ) : view.pages.list.length === 0 ? (
          <p className="text-muted-foreground">token-ით სხვა გვერდი ვერ მოიძებნა (token-ის აღებისას გვერდები მონიშნე).</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              მონიშნე, სად გინდა პოსტვა: თითოეულს თავისი რიგი, საათები და caption-ები ექნება. behero.ge-ის ლოგო ამ გვერდებზე არ
              დაედება.
            </p>
            <ul className="flex flex-col gap-2">
              {view.pages.list.map((page) => (
                <li key={page.pageId} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2">
                  <span className="min-w-40 font-medium">{page.name}</span>
                  <label className="flex items-center gap-1.5">
                    <input
                      id={`page-fb-${page.pageId}`}
                      type="checkbox"
                      checked={picked.includes(`fbp_${page.pageId}`)}
                      onChange={(event) => toggle(`fbp_${page.pageId}`, event.target.checked)}
                    />
                    Facebook
                  </label>
                  {page.instagram ? (
                    <label className="flex items-center gap-1.5">
                      <input
                        id={`page-ig-${page.instagram.id}`}
                        type="checkbox"
                        checked={picked.includes(`igu_${page.instagram.id}`)}
                        onChange={(event) => toggle(`igu_${page.instagram!.id}`, event.target.checked)}
                      />
                      Instagram @{page.instagram.username}
                    </label>
                  ) : (
                    <span className="text-xs text-muted-foreground">Instagram არ არის მიბმული</span>
                  )}
                </li>
              ))}
            </ul>
            <div>
              <Button
                disabled={busy || !changed}
                onClick={() => {
                  setBusy(true)
                  void onAct(async () => {
                    const result = await saveQueueChannels(picked)
                    if (result.ok) onNotice("გვერდები შენახულია: ახალი რიგები ზემოთ ჩანართებად გამოჩნდება.")
                    return result
                  }).finally(() => setBusy(false))
                }}
              >
                შენახვა
              </Button>
            </div>
          </>
        )}
      </div>
    </details>
  )
}

function StatusStrip({ view, cronOk, lastTick }: { view: QueueView; cronOk: boolean; lastTick: number | null }) {
  const share = view.storage.limit ? view.storage.queue / view.storage.limit : 0
  const connected = view.current.connected
  return (
    <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
      <div>
        <p className="text-xs text-muted-foreground">{view.current.label}</p>
        <p className={cn("font-medium", !connected && "text-destructive")}>
          {connected
            ? "დაკავშირებულია"
            : view.channel === "fb" || view.channel === "ig"
              ? "არ არის დაკავშირებული (META_… ცვლადები)"
              : "არ არის დაკავშირებული (გვერდის წვდომა / META_USER_ACCESS_TOKEN)"}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">ავტომატური შემოწმება (cron)</p>
        <p className={cn("font-medium", !cronOk && "text-destructive")}>
          {lastTick === null
            ? "ჯერ არ გაშვებულა"
            : cronOk
              ? `მუშაობს · ${lastTick} წთ წინ`
              : `ბოლოს ${lastTick > 120 ? `${Math.round(lastTick / 60)} სთ` : `${lastTick} წთ`} წინ`}
        </p>
        {!cronOk ? (
          <p className="text-xs text-muted-foreground">
            დააყენე cron-job.org: ყოველ 5 წუთში{" "}
            <code className="break-all">/api/cron/tick</code>, Authorization: Bearer CRON_SECRET.
          </p>
        ) : null}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">რიგის ფაილები საცავში (ორივე არხი)</p>
        <p className={cn("font-medium", share > 0.8 && "text-destructive")}>
          {formatBytes(view.storage.queue)} / {formatBytes(view.storage.limit)}
        </p>
      </div>
    </section>
  )
}

function SettingsPanel({
  view,
  onSaved,
  onError,
}: {
  view: QueueView
  onSaved: () => Promise<void>
  onError: (message: string) => void
}) {
  const [enabled, setEnabled] = useState(view.settings.enabled)
  const [times, setTimes] = useState(view.settings.times.join(", "))
  const [deleteAfter, setDeleteAfter] = useState(view.settings.deleteAfter)
  const [defaultCaption, setDefaultCaption] = useState(view.settings.defaultCaption)
  const [slotKinds, setSlotKinds] = useState<Record<string, SlotKind>>(view.settings.slotKinds)
  const parsedTimes = parseTimes(times)
  const [state, setState] = useState<string | null>(null)

  async function save() {
    setState("…")
    const kinds = Object.fromEntries(parsedTimes.map((time) => [time, kindAt(time, slotKinds)]))
    const result = await saveQueueSettings(view.channel, { enabled, times, deleteAfter, defaultCaption, slotKinds: kinds })
    if (result.ok) {
      setTimes(result.data.times.join(", "))
      setState("შენახულია ✓ განრიგი განახლდა")
      await onSaved()
    } else {
      setState(null)
      onError(result.error)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
      <h2 className="font-heading text-lg font-semibold">განრიგი</h2>
      <label className="flex items-center gap-2">
        <input id="queue-enabled" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        ავტომატური გამოქვეყნება ჩართულია
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          გამოქვეყნების საათები (თბილისი), მძიმით: დღეში იმდენი პოსტი, რამდენი საათიცაა
        </span>
        <input
          id="queue-times"
          value={times}
          onChange={(event) => setTimes(event.target.value)}
          className="h-9 rounded-lg border border-input bg-input/30 px-3 text-sm"
          placeholder={view.channel === "ig" ? "09:30, 12:30, 15:30, 19:30, 22:00" : "10:00, 13:00, 17:00, 21:00, 23:00"}
        />
      </label>
      {parsedTimes.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            რა გამოქვეყნდეს თითო საათზე (თუ ერთი ტიპი გათავდა, მის საათებს მეორე დაიკავებს)
          </span>
          <div className="flex flex-wrap gap-2">
            {parsedTimes.map((time) => (
              <label key={time} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
                <span className="tabular-nums">{time}</span>
                <select
                  id={`slot-kind-${time}`}
                  value={kindAt(time, slotKinds)}
                  onChange={(event) =>
                    setSlotKinds((current) => ({ ...current, [time]: event.target.value as SlotKind }))
                  }
                  className="h-7 rounded-md border border-input bg-input/30 px-1 text-xs"
                >
                  <option value="video">ვიდეო</option>
                  <option value="image">ფოტო</option>
                  <option value="any">ნებისმიერი</option>
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <label className="flex items-center gap-2">
        <input
          id="queue-delete-after"
          type="checkbox"
          checked={deleteAfter}
          onChange={(event) => setDeleteAfter(event.target.checked)}
        />
        გამოქვეყნების შემდეგ ფაილი წაიშალოს საცავიდან (ადგილის დასაზოგად)
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          ნაგულისხმევი caption: ყველა ატვირთულ ფაილს თავისით მიენიჭება (ცალკეულზე შეგიძლია შეცვალო)
        </span>
        <textarea
          id="queue-default-caption"
          value={defaultCaption}
          onChange={(event) => setDefaultCaption(event.target.value)}
          rows={8}
          maxLength={2200}
          className="resize-y rounded-lg border border-input bg-input/30 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={state === "…"}>
          შენახვა
        </Button>
        {state && state !== "…" ? <span className="text-xs text-primary">{state}</span> : null}
      </div>
    </section>
  )
}

/** Loads a file only when asked, straight from storage: listing the queue
    must not download every video (that used up the monthly bandwidth). */
function QueuePreview({ item }: { item: QueueItem }) {
  const [src, setSrc] = useState<string | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  const Icon = item.kind === "video" ? Film : ImageIcon

  async function open() {
    setState("loading")
    const result = await queueMediaLink(item.id)
    if (result.ok) {
      setSrc(result.data)
      setState("idle")
    } else setState("error")
  }

  return (
    <div className="aspect-[9/16] w-24 overflow-hidden rounded-lg bg-muted">
      {src ? (
        item.kind === "video" ? (
          <video src={src} controls autoPlay playsInline className="size-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-cover" />
        )
      ) : item.mediaUrl ? (
        <button
          type="button"
          onClick={() => void open()}
          disabled={state === "loading"}
          className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {state === "loading" ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
          {state === "error" ? "ვერ ჩაიტვირთა" : "ნახვა"}
        </button>
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <Icon className="size-5" />
        </div>
      )}
    </div>
  )
}

function QueueRow({
  item,
  index,
  count,
  canPublish,
  badge,
  onAct,
}: {
  item: QueueItem
  index: number
  count: number
  canPublish: boolean
  badge: boolean
  onAct: (run: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>
}) {
  const [caption, setCaption] = useState(item.caption)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmPost, setConfirmPost] = useState(false)
  const status = STATUS[item.status]
  const editable = item.status === "queued" || item.status === "failed" || item.status === "partial"

  async function run(task: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    await onAct(task)
    setBusy(false)
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row">
      <div className="flex shrink-0 items-start gap-3">
        <span className="mt-1 w-6 text-right text-sm text-muted-foreground tabular-nums">{index + 1}</span>
        <QueuePreview item={item} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", status.tone)}>{status.label}</span>
          <span className="inline-flex items-center gap-1 text-sm">
            <Clock className="size-3.5 text-muted-foreground" /> {formatWhen(item.scheduledAt)}
          </span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {item.fileName} · {formatBytes(item.bytes)}
          </span>
          {badge && item.kind === "video" && item.status !== "published" ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs",
                item.branding === "done"
                  ? "bg-primary/15 text-primary"
                  : item.branding && item.branding !== "skip"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground"
              )}
              title={item.branding && item.branding !== "done" && item.branding !== "skip" ? item.branding : undefined}
            >
              {item.branding === "done"
                ? "behero.ge ✓"
                : item.branding === "skip"
                  ? "ლოგოს გარეშე"
                  : item.branding
                    ? "behero.ge ვერ დაედო"
                    : "behero.ge დაედება"}
              {item.status === "queued" && (item.branding === null || item.branding === "skip") ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => setQueueItemBadge(item.id, item.branding === "skip"))}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {item.branding === "skip" ? "დაედოს" : "არ დაედოს"}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>

        <textarea
          id={`caption-${item.id}`}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          onBlur={() => {
            if (caption.trim() !== item.caption) void run(() => saveQueueCaption(item.id, caption))
          }}
          disabled={!editable}
          rows={3}
          maxLength={2200}
          placeholder="Caption… (ცარიელზე ნაგულისხმევი caption გამოქვეყნდება)"
          className="resize-y rounded-lg border border-input bg-input/30 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        {item.error ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {item.error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {item.status === "queued" ? (
            <>
              <Button variant="ghost" size="icon" aria-label="წინ" disabled={busy || index === 0} onClick={() => void run(() => moveQueueItem(item.id, "up"))}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon" aria-label="უკან" disabled={busy || index === count - 1} onClick={() => void run(() => moveQueueItem(item.id, "down"))}>
                <ArrowDown />
              </Button>
              {canPublish ? (
                confirmPost ? (
                  <>
                    <Button
                      onClick={() => {
                        setConfirmPost(false)
                        void run(() => publishQueueItemNow(item.id))
                      }}
                      disabled={busy}
                    >
                      <Send /> დიახ, ახლავე
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmPost(false)}>
                      გაუქმება
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => setConfirmPost(true)} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <Send />} ახლავე გამოქვეყნება
                  </Button>
                )
              ) : null}
            </>
          ) : null}
          {item.status === "failed" || item.status === "partial" ? (
            <Button variant="secondary" onClick={() => void run(() => retryQueueItem(item.id))} disabled={busy}>
              <RotateCcw /> თავიდან რიგში
            </Button>
          ) : null}
          {item.status !== "publishing" ? (
            confirmDelete ? (
              <>
                <Button variant="destructive" onClick={() => void run(() => removeQueueItem(item.id))} disabled={busy}>
                  <Trash2 /> დიახ, წაშლა
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  გაუქმება
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 /> წაშლა
              </Button>
            )
          ) : null}
        </div>
      </div>
    </li>
  )
}
