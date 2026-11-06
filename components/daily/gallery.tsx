"use client"

import { ArrowLeft, Download, Film, Image as ImageIcon, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { getGallery } from "@/daily/actions"
import type { DailyItem } from "@/daily/db"

import { cn } from "@/lib/utils"

import { downloadSrc, fileNameFor, itemTitle, ResultPreview } from "./media"

type Filter = "all" | "video" | "poster"

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "ყველა" },
  { id: "video", label: "ვიდეოები" },
  { id: "poster", label: "პოსტერები" },
]

function formatDay(day: string): string {
  return new Intl.DateTimeFormat("ka-GE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`))
}

/** Every finished video and poster, grouped by day, with a large viewer. */
export function Gallery() {
  const [items, setItems] = useState<DailyItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")

  useEffect(() => {
    let live = true
    void getGallery().then((result) => {
      if (!live) return
      if (result.ok) setItems(result.data)
      else setError(result.error)
    })
    return () => {
      live = false
    }
  }, [])

  const groups = useMemo(() => {
    const visible = (items ?? []).filter((item) => filter === "all" || item.kind === filter)
    const byDay = new Map<string, DailyItem[]>()
    for (const item of visible) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item])
    return [...byDay.entries()]
  }, [items, filter])

  const counts = {
    all: items?.length ?? 0,
    video: items?.filter((item) => item.kind === "video").length ?? 0,
    poster: items?.filter((item) => item.kind === "poster").length ?? 0,
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> დღის გეგმა
          </Link>
          <h1 className="font-heading text-2xl font-semibold">გალერეა</h1>
          <p className="text-sm text-muted-foreground">
            ყველა მზა ვიდეო და პოსტერი. დააჭირე დიდად სანახავად, ჩამოსატვირთად ან caption-ის დასაკოპირებლად.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-border p-1" role="tablist">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm",
                filter === option.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {option.label} · {counts[option.id]}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/15 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {items === null && !error ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> იტვირთება…
        </p>
      ) : null}

      {items !== null && groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
          <ImageIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">ჯერ მზა მასალა არ არის</p>
          <p className="text-sm text-muted-foreground">
            როცა ვიდეო ან პოსტერი დამზადდება, აქ გამოჩნდება.
          </p>
        </div>
      ) : null}

      {groups.map(([day, dayItems]) => (
        <section key={day} className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold capitalize">
            {formatDay(day)} <span className="text-sm font-normal text-muted-foreground">· {day}</span>
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {dayItems.map((item) => (
              <figure key={item.id} className="flex flex-col gap-2">
                <ResultPreview item={item} />
                <figcaption className="flex items-center justify-between gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    {item.kind === "video" ? (
                      <Film className="size-4 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="size-4 text-muted-foreground" />
                    )}
                    {itemTitle(item)}
                  </span>
                  {item.resultUrl ? (
                    <a
                      href={downloadSrc(item.resultUrl, fileNameFor(item))}
                      download={fileNameFor(item)}
                      className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted"
                      aria-label={`${itemTitle(item)}: ჩამოტვირთვა`}
                    >
                      <Download className="size-4" />
                    </a>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
