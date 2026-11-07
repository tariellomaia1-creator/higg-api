"use client"

import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Images,
  Layers,
  LogOut,
  Play,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  DEFAULT_POSTER_SETTINGS,
  ESTIMATED_CREDITS,
  POSTER_QUALITIES,
  POSTER_RESOLUTIONS,
  POSTERS_PER_DAY,
  USD_PER_CREDIT,
  VIDEOS_PER_DAY,
  addDays,
  isDay,
} from "@/daily/config"
import type { ItemKind, PosterSettings } from "@/daily/config"
import {
  deleteDay,
  fillMissingCaptions,
  getCaptionFooter,
  getPosterSettings,
  getCreditBalance,
  getDayView,
  getSetupStatus,
  logout,
  refreshGenerating,
  runSchedulerNow,
  saveCaptionFooter,
  savePosterSettings,
} from "@/daily/actions"
import type { DayView, Result, SetupStatus } from "@/daily/actions"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { itemTitle } from "./media"
import { SlotCard } from "./slot-card"

const SETUP_ITEMS: Array<{ key: keyof SetupStatus; label: string }> = [
  { key: "database", label: "მონაცემთა ბაზა (Neon Postgres)" },
  { key: "blob", label: "ფაილების საცავი (Vercel Blob)" },
  { key: "generator", label: "kie.ai API key (KIE_API_KEY)" },
  { key: "scheduler", label: "ავტომატური გაშვება (CRON_SECRET)" },
]

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat("ka-GE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`))
}

export function DailyPlanner() {
  const [day, setDay] = useState<string | null>(null)
  const [view, setView] = useState<DayView | null>(null)
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [captionFooter, setCaptionFooter] = useState("")
  const [balance, setBalance] = useState<
    { value: number } | { error: string } | null
  >(null)

  const refreshBalance = useCallback(async () => {
    const result = await getCreditBalance()
    setBalance(result.ok ? { value: result.data } : { error: result.error })
  }, [])

  const lastStatus = useRef<Map<string, string>>(new Map())
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null)

  const apply = useCallback((result: Result<DayView>) => {
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    // Announce slots that just finished while the page was open.
    for (const item of result.data.items) {
      const before = lastStatus.current.get(item.id)
      if (before === "generating" && item.status === "ready")
        setToast({ text: `✓ ${itemTitle(item)} მზადაა`, tone: "ok" })
      else if (before === "generating" && item.status === "failed")
        setToast({ text: `${itemTitle(item)} ვერ შეიქმნა`, tone: "bad" })
      lastStatus.current.set(item.id, item.status)
    }
    setView(result.data)
    setDay(result.data.day)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const load = useCallback(
    async (target: string | null) => apply(await getDayView(target)),
    [apply]
  )

  useEffect(() => {
    let live = true
    void getDayView(null).then((result) => {
      if (live) apply(result)
    })
    void getSetupStatus().then((result) => {
      if (live && result.ok) setSetup(result.data)
    })
    void getCreditBalance().then((result) => {
      if (live) setBalance(result.ok ? { value: result.data } : { error: result.error })
    })
    void getCaptionFooter().then((result) => {
      if (live && result.ok) setCaptionFooter(result.data)
    })
    // Slots saved before auto captions, or saved empty, get one on open.
    void fillMissingCaptions().then(async (result) => {
      if (live && result.ok) apply(await getDayView(null))
    })
    return () => {
      live = false
    }
  }, [apply])

  // Keep statuses fresh while something is in flight.
  const active = view?.items.some(
    (item) => item.status === "generating" || item.publishStatus === "publishing"
  )
  useEffect(() => {
    if (!day) return
    const timer = window.setInterval(
      () => {
        void (async () => {
          // While something is generating, check kie.ai from here too, so
          // results show up without waiting for the scheduler.
          if (active) await refreshGenerating()
          await load(day)
          if (active) await refreshBalance()
        })()
      },
      active ? 12_000 : 60_000
    )
    return () => window.clearInterval(timer)
  }, [active, day, load, refreshBalance])

  async function runNow() {
    setRunning(true)
    setNotice(null)
    const result = await runSchedulerNow()
    setRunning(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const report = result.data
    setNotice(
      `გაეშვა: ${report.submitted} დაიწყო, ${report.completed} დასრულდა, ${report.failed} ჩავარდა, ${report.published} გამოქვეყნდა.` +
        (report.notes.length ? ` ${report.notes.join(" ")}` : "")
    )
    await load(day)
    await refreshBalance()
  }

  async function removeDay() {
    if (!view) return
    if (
      !window.confirm(
        `${formatDay(view.day)}: წავშალო ამ დღის ყველა სლოტი, ფოტო და ვიდეო? ჯერ ჩამოტვირთე, რაც გჭირდება.`
      )
    )
      return
    const result = await deleteDay(view.day)
    if (!result.ok) setError(result.error)
    else {
      setNotice(`წაიშალა ${result.data} სლოტი.`)
      await load(view.day)
    }
  }

  const autoPublish = Boolean(setup?.facebook)
  const missing = setup ? SETUP_ITEMS.filter((item) => !setup[item.key]) : []
  const storageShare = view ? view.storage.used / view.storage.limit : 0

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">BeHero Daily</h1>
          <p className="text-sm text-muted-foreground">
            ყოველდღე {VIDEOS_PER_DAY} ვიდეო და {POSTERS_PER_DAY} პოსტერი. გენერაცია
            იწყება 06:00-ზე და 08:00-მდე მზადაა (თბილისის დრო). „ახლავე
            გაშვება“ დღევანდელ შევსებულ სლოტებს მაშინვე იწყებს.
            {autoPublish
              ? " გამოქვეყნება Facebook-ზე და Instagram-ზე 08:00-დან, საათში ერთი."
              : " გამოქვეყნება ხელით: ჩამოტვირთე და ატვირთე."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={runNow} disabled={running}>
            <Play /> {running ? "მუშაობს…" : "ახლავე გაშვება"}
          </Button>
          <Link
            href="/batch"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm hover:bg-muted"
          >
            <Layers className="size-4" /> Batch
          </Link>
          <Link
            href="/gallery"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm hover:bg-muted"
          >
            <Images className="size-4" /> გალერეა
          </Link>
          <Link
            href="/studio"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm hover:bg-muted"
          >
            <Clapperboard className="size-4" /> სტუდია
          </Link>
          <form action={logout}>
            <Button variant="ghost" type="submit" aria-label="გასვლა">
              <LogOut />
            </Button>
          </form>
        </div>
      </div>

      <CreditPanel balance={balance} view={view} onRefresh={() => void refreshBalance()} />

      <PosterQualityPanel />

      <CaptionFooterPanel
        value={captionFooter}
        onSaved={setCaptionFooter}
        onFilled={() => void load(day)}
      />

      {toast ? (
        <div
          role="status"
          className={cn(
            "fixed right-4 bottom-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg",
            toast.tone === "ok" ? "bg-primary text-primary-foreground" : "bg-destructive text-white"
          )}
        >
          {toast.text}
        </div>
      ) : null}

      {missing.length ? (
        <section className="rounded-2xl border border-border bg-card p-4 text-sm">
          <h2 className="font-medium">დასაკავშირებელია</h2>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">
            {missing.map((item) => (
              <li key={item.key}>{item.label}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/15 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl bg-muted px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}

      {view ? (
        <section
          className={cn(
            "rounded-2xl border p-4 text-sm",
            storageShare >= 0.8 ? "border-destructive/50 bg-destructive/10" : "border-border bg-card"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              საცავი: {formatBytes(view.storage.used)} / {formatBytes(view.storage.limit)}
            </span>
            {storageShare >= 0.8 ? (
              <span className="font-medium text-destructive">
                საცავი თითქმის სავსეა. ჩამოტვირთე ძველი დღეები და წაშალე.
              </span>
            ) : null}
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(storageShare * 100)}
            aria-label="საცავის შევსება"
          >
            <div
              className={cn("h-full", storageShare >= 0.8 ? "bg-destructive" : "bg-primary")}
              style={{ width: `${Math.min(100, storageShare * 100)}%` }}
            />
          </div>
          {view.days.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {view.days.map((entry) => (
                <button
                  key={entry.day}
                  type="button"
                  onClick={() => void load(entry.day)}
                  className={cn(
                    "rounded-lg border px-2 py-1 text-xs hover:bg-muted",
                    entry.day === view.day ? "border-ring" : "border-border"
                  )}
                >
                  {entry.day} · {entry.count} · {formatBytes(entry.bytes)}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {view ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => void load(addDays(view.day, -1))}
              aria-label="წინა დღე"
            >
              <ChevronLeft />
            </Button>
            <input
              type="date"
              value={view.day}
              onChange={(event) => {
                if (isDay(event.target.value)) void load(event.target.value)
              }}
              className="h-8 rounded-lg border border-input bg-input/30 px-2 text-sm [color-scheme:dark]"
              aria-label="დღე"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => void load(addDays(view.day, 1))}
              aria-label="შემდეგი დღე"
            >
              <ChevronRight />
            </Button>
            {view.day !== view.today ? (
              <Button variant="ghost" onClick={() => void load(view.today)}>
                დღეს
              </Button>
            ) : null}
            <span className="text-sm text-muted-foreground">
              {formatDay(view.day)}
              {view.day === view.today ? " · დღეს" : ""}
            </span>
            {view.items.length ? (
              <Button variant="destructive" className="ml-auto" onClick={removeDay}>
                <Trash2 /> დღის წაშლა
              </Button>
            ) : null}
          </div>

          <DaySection title="ვიდეოები · Veo 3.1 Lite · 9:16 · 8 წმ · 720p · ხმით">
            {Array.from({ length: VIDEOS_PER_DAY }, (_, slot) => (
              <SlotCard
                key={slotKey(view, "video", slot)}
                day={view.day}
                kind="video"
                slot={slot}
                item={findItem(view, "video", slot)}
                autoPublish={autoPublish}
                captionFooter={captionFooter}
                onChanged={() => void load(view.day)}
              />
            ))}
          </DaySection>
          <DaySection title="პოსტერები · GPT Image 2.6 Sunburst · 1:1">
            {Array.from({ length: POSTERS_PER_DAY }, (_, slot) => (
              <SlotCard
                key={slotKey(view, "poster", slot)}
                day={view.day}
                kind="poster"
                slot={slot}
                item={findItem(view, "poster", slot)}
                autoPublish={autoPublish}
                captionFooter={captionFooter}
                onChanged={() => void load(view.day)}
              />
            ))}
          </DaySection>
        </>
      ) : !error ? (
        <p className="text-sm text-muted-foreground">იტვირთება…</p>
      ) : null}
    </main>
  )
}

function findItem(view: DayView, kind: ItemKind, slot: number) {
  return view.items.find((item) => item.kind === kind && item.slot === slot)
}

/** Remounts a card when its saved content changes on the server, so the form
    shows what was saved; status-only updates keep unsaved edits. */
function slotKey(view: DayView, kind: ItemKind, slot: number): string {
  const item = findItem(view, kind, slot)
  return [view.day, kind, slot, item?.id, item?.prompt, item?.caption, item?.startImageUrl].join("|")
}

function DaySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

function CreditPanel({
  balance,
  view,
  onRefresh,
}: {
  balance: { value: number } | { error: string } | null
  view: DayView | null
  onRefresh: () => void
}) {
  const planMin =
    VIDEOS_PER_DAY * ESTIMATED_CREDITS.video.min + POSTERS_PER_DAY * ESTIMATED_CREDITS.poster.min
  const planMax =
    VIDEOS_PER_DAY * ESTIMATED_CREDITS.video.max + POSTERS_PER_DAY * ESTIMATED_CREDITS.poster.max
  const spentToday = view?.items.reduce((sum, item) => sum + item.creditsUsed, 0) ?? 0
  const low = balance !== null && "value" in balance && balance.value < planMax
  return (
    <section
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border p-4 text-sm",
        low ? "border-destructive/50 bg-destructive/10" : "border-border bg-card"
      )}
    >
      <div>
        <p className="text-xs text-muted-foreground">kie.ai ბალანსი</p>
        <p className="font-heading text-lg font-semibold">
          {balance === null
            ? "…"
            : "value" in balance
              ? `${Math.round(balance.value * 10) / 10} კრედიტი (≈ $${(balance.value * USD_PER_CREDIT).toFixed(2)})`
              : "ვერ წავიკითხე"}
        </p>
        {balance !== null && "error" in balance ? (
          <p className="text-xs text-destructive">{balance.error}</p>
        ) : null}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">დღის გეგმა (სავარაუდო)</p>
        <p className="font-medium">
          {planMin === planMax ? planMin : `${planMin}–${planMax}`} კრედიტი
          <span className="text-muted-foreground">
            {" "}
            (≈ ${(planMin * USD_PER_CREDIT).toFixed(2)}
            {planMin === planMax ? "" : `–$${(planMax * USD_PER_CREDIT).toFixed(2)}`})
          </span>
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">ამ დღეს დაიხარჯა</p>
        <p className="font-medium">
          {Math.round(spentToday * 10) / 10} კრედიტი
          <span className="text-muted-foreground"> (≈ ${(spentToday * USD_PER_CREDIT).toFixed(2)})</span>
        </p>
      </div>
      {low ? (
        <p className="basis-full text-xs font-medium text-destructive">
          ბალანსი დღის გეგმას არ ყოფნის. შეავსე kie.ai-ზე.
        </p>
      ) : null}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onRefresh}>
        განახლება
      </Button>
    </section>
  )
}

function CaptionFooterPanel({
  value,
  onSaved,
  onFilled,
}: {
  value: string
  onSaved: (value: string) => void
  onFilled: () => void
}) {
  const [fillState, setFillState] = useState<string | null>(null)
  async function fillAll() {
    setFillState("…")
    const result = await fillMissingCaptions()
    if (result.ok) {
      setFillState(
        result.data ? `შეივსო ${result.data} caption ✓` : "ცარიელი caption აღარ დარჩა ✓"
      )
      onFilled()
    } else setFillState(result.error)
  }
  const [draft, setDraft] = useState<string | null>(null)
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle")
  const text = draft ?? value
  async function save() {
    setState("saving")
    const result = await saveCaptionFooter(text)
    if (result.ok) {
      onSaved(result.data)
      setDraft(null)
      setState("saved")
      await fillAll()
    } else setState(result.error)
  }
  return (
    <details className="rounded-2xl border border-border bg-card p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        Caption-ის მუდმივი ნაწილი
        <span className="font-normal text-muted-foreground">
          {" "}
          · ემატება ყველა ავტომატურ caption-ს (ბმული, CTA, ჰეშთეგები)
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          caption = პრომტში ბრჭყალებით ჩაწერილი ქართული ტექსტი + ეს ნაწილი. ცარიელ caption-ს შენახვისას ავტომატურად
          ვავსებ; შენ მიერ დაწერილს არ ვცვლი. უფასოა, კრედიტი არ იხარჯება.
        </p>
        <textarea
          value={text}
          onChange={(event) => {
            setDraft(event.target.value)
            setState("idle")
          }}
          rows={4}
          maxLength={1000}
          placeholder={"სცადე უფასოდ 👉 behero.ge\n#მათემატიკა #ეროვნულები #BeHero"}
          className="resize-y rounded-lg border border-input bg-input/30 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={state === "saving" || draft === null}>
            შენახვა
          </Button>
          <Button variant="secondary" onClick={() => void fillAll()} disabled={fillState === "…"}>
            ცარიელი caption-ების შევსება
          </Button>
          {state === "saved" ? <span className="text-xs text-primary">შენახულია ✓</span> : null}
          {fillState && fillState !== "…" ? (
            <span className="text-xs text-muted-foreground">{fillState}</span>
          ) : null}
          {state !== "idle" && state !== "saving" && state !== "saved" ? (
            <span className="text-xs text-destructive">{state}</span>
          ) : null}
        </div>
      </div>
    </details>
  )
}

const QUALITY_LABEL: Record<string, string> = {
  medium: "medium (იაფი)",
  high: "high",
  xhigh: "xhigh",
  max: "max (საუკეთესო ტექსტი)",
}

function PosterQualityPanel() {
  const [settings, setSettings] = useState<PosterSettings>(DEFAULT_POSTER_SETTINGS)
  const [state, setState] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void getPosterSettings().then((result) => {
      if (live && result.ok) setSettings(result.data)
    })
    return () => {
      live = false
    }
  }, [])

  async function change(next: PosterSettings) {
    setSettings(next)
    setState("…")
    const result = await savePosterSettings(next)
    setState(result.ok ? "შენახულია ✓" : result.error)
  }

  return (
    <section className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-card p-4 text-sm">
      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
        <p className="font-medium">პოსტერის ხარისხი (GPT Image 2.6 Sunburst)</p>
        <p className="text-xs text-muted-foreground">
          max ქართულ ტექსტს ყველაზე ზუსტად წერს, მაგრამ მეტი კრედიტი ჯდება. 2K ტექსტს უფრო მკაფიოს ხდის, ფასი კიდევ იზრდება.
          ზუსტ ხარჯს ბარათზე „დაიხარჯა“ აჩვენებს.
        </p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">ხარისხი</span>
        <select
          id="poster-quality"
          value={settings.quality}
          onChange={(event) =>
            void change({ ...settings, quality: event.target.value as PosterSettings["quality"] })
          }
          className="h-9 rounded-lg border border-input bg-input/30 px-2 text-sm"
        >
          {POSTER_QUALITIES.map((q) => (
            <option key={q} value={q}>
              {QUALITY_LABEL[q] ?? q}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">რეზოლუცია</span>
        <select
          id="poster-resolution"
          value={settings.resolution}
          onChange={(event) =>
            void change({ ...settings, resolution: event.target.value as PosterSettings["resolution"] })
          }
          className="h-9 rounded-lg border border-input bg-input/30 px-2 text-sm"
        >
          {POSTER_RESOLUTIONS.map((r) => (
            <option key={r} value={r}>
              {r === "1K" ? "1K (1024×1024)" : "2K (2048×2048)"}
            </option>
          ))}
        </select>
      </label>
      {state && state !== "…" ? <span className="text-xs text-muted-foreground">{state}</span> : null}
    </section>
  )
}
