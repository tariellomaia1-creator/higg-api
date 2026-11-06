"use client"

import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  LogOut,
  Play,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import {
  ESTIMATED_CREDITS,
  POSTERS_PER_DAY,
  USD_PER_CREDIT,
  VIDEOS_PER_DAY,
  addDays,
  isDay,
} from "@/daily/config"
import type { ItemKind } from "@/daily/config"
import {
  deleteDay,
  getCreditBalance,
  getDayView,
  getSetupStatus,
  logout,
  runSchedulerNow,
} from "@/daily/actions"
import type { DayView, Result, SetupStatus } from "@/daily/actions"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
  const [balance, setBalance] = useState<
    { value: number } | { error: string } | null
  >(null)

  const refreshBalance = useCallback(async () => {
    const result = await getCreditBalance()
    setBalance(result.ok ? { value: result.data } : { error: result.error })
  }, [])

  const apply = useCallback((result: Result<DayView>) => {
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setView(result.data)
    setDay(result.data.day)
  }, [])

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
    const timer = window.setInterval(() => {
      void load(day)
      void refreshBalance()
    }, active ? 20_000 : 60_000)
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
                onChanged={() => void load(view.day)}
              />
            ))}
          </DaySection>
          <DaySection title="პოსტერები · GPT Image 2.6 Sunburst · 1:1 · 1K">
            {Array.from({ length: POSTERS_PER_DAY }, (_, slot) => (
              <SlotCard
                key={slotKey(view, "poster", slot)}
                day={view.day}
                kind="poster"
                slot={slot}
                item={findItem(view, "poster", slot)}
                autoPublish={autoPublish}
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
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">ამ დღეს დაიხარჯა</p>
        <p className="font-medium">{Math.round(spentToday * 10) / 10} კრედიტი</p>
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
