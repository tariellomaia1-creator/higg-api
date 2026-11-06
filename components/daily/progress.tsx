"use client"

import { AlertCircle, CheckCircle2, Clock, Loader2, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

import type { ItemKind } from "@/daily/config"
import type { DailyItem } from "@/daily/db"

import { cn } from "@/lib/utils"

/** Typical kie.ai turnaround, used only to draw an estimated progress bar. */
const EXPECTED_SECONDS: Record<ItemKind, number> = { video: 240, poster: 90 }

const STEPS = ["შენახულია", "რიგში", "გენერირდება", "მზადაა"] as const

function stepIndex(item: DailyItem | undefined, dirtyOrEmpty: boolean): number {
  if (!item || dirtyOrEmpty) return -1
  if (item.status === "ready") return 3
  if (item.status === "generating") return 2
  return 0
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** Four-step strip under each slot: saved → queued → generating → ready. */
export function StepStrip({
  item,
  unsaved,
}: {
  item: DailyItem | undefined
  unsaved: boolean
}) {
  const current = stepIndex(item, unsaved)
  const failed = item?.status === "failed"
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="პროცესი">
      {STEPS.map((label, index) => {
        const done = !failed && index <= current
        const active = !failed && index === current && current < 3
        const isFailedStep = failed && index === 2
        return (
          <li key={label} className="flex flex-col gap-1">
            <span
              className={cn(
                "h-1.5 rounded-full",
                isFailedStep
                  ? "bg-destructive"
                  : done
                    ? "bg-primary"
                    : "bg-muted",
                active && "animate-pulse"
              )}
            />
            <span
              className={cn(
                "truncate text-[11px]",
                isFailedStep
                  ? "text-destructive"
                  : done
                    ? "text-foreground"
                    : "text-muted-foreground"
              )}
            >
              {isFailedStep ? "ვერ შეიქმნა" : label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** The big stage area of a slot while it has no finished result. */
export function StageState({
  kind,
  item,
  unsaved,
}: {
  kind: ItemKind
  item: DailyItem | undefined
  unsaved: boolean
}) {
  const generating = item?.status === "generating"
  const now = useNow(generating)
  const aspect = kind === "video" ? "aspect-[9/16] max-w-56 mx-auto" : "aspect-square"

  if (generating) {
    const started = item?.submittedAt ? Date.parse(item.submittedAt) : now
    const elapsed = (now - started) / 1000
    const expected = EXPECTED_SECONDS[kind]
    const share = Math.min(0.95, elapsed / expected)
    const overdue = elapsed > expected * 1.5
    return (
      <div
        className={cn(
          "relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-primary/30 bg-primary/5 p-4 text-center",
          aspect
        )}
        role="status"
        aria-live="polite"
      >
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-b from-primary/10 via-transparent to-primary/5 motion-reduce:animate-none" />
        <Loader2 className="relative size-8 animate-spin text-primary motion-reduce:animate-none" />
        <div className="relative">
          <p className="font-medium">გენერირდება…</p>
          <p className="text-xs text-muted-foreground">
            {clock(elapsed)} · ჩვეულებრივ ~{clock(expected)}
          </p>
        </div>
        <div className="relative h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-1000"
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </div>
        <p className="relative text-[11px] text-muted-foreground">
          {overdue
            ? "ჩვეულებრივზე დიდხანს გრძელდება, kie.ai დატვირთულია. შედეგი თავისით გამოჩნდება."
            : "შედეგი ავტომატურად გამოჩნდება, გვერდის განახლება არ არის საჭირო."}
        </p>
      </div>
    )
  }

  if (item?.status === "failed") {
    return (
      <div
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-center",
          aspect
        )}
      >
        <AlertCircle className="size-8 text-destructive" />
        <p className="font-medium text-destructive">ვერ შეიქმნა</p>
        <p className="text-xs text-muted-foreground">
          მიზეზი ქვემოთ წერია. გაასწორე და დააჭირე „თავიდან გენერაცია“.
        </p>
      </div>
    )
  }

  const saved = item && !unsaved
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-center",
        aspect
      )}
    >
      {saved ? (
        <Clock className="size-8 text-muted-foreground" />
      ) : (
        <Sparkles className="size-8 text-muted-foreground" />
      )}
      <p className="font-medium">{saved ? "რიგშია" : "აქ გამოჩნდება შედეგი"}</p>
      <p className="text-xs text-muted-foreground">
        {saved
          ? "დაიწყება 06:00-ზე, ან ახლავე: „ახლავე გაშვება“."
          : kind === "video"
            ? "ატვირთე start image, დაწერე პრომტი და შეინახე."
            : "დაწერე პრომტი და შეინახე."}
      </p>
    </div>
  )
}

export function ReadyMark() {
  return <CheckCircle2 className="size-4 text-primary" aria-hidden />
}
