"use client"

import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

import {
  ScreenEmptyState,
  type ScreenEmptyStateContent,
} from "@/components/studio/screen-empty-state"

import { DensityControl } from "./density-control"
import { GalleryTile } from "./gallery-tile"
import type { GalleryItem, LoadTier } from "./gallery-types"
import { useJustifiedGallery } from "./use-justified-gallery"
import { useReducedMotion } from "./use-reduced-motion"

/**
 * JustifiedGallery — the virtualized justified-masonry feed. The engine owns
 * layout + windowing math; this renders only the visible rows as absolutely
 * positioned tiles over a fixed-height sizer.
 */
export interface JustifiedGalleryProps {
  items: GalleryItem[]
  title?: ReactNode
  grouped?: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void | Promise<unknown>
  emptyState: ScreenEmptyStateContent
  onDelete?: (item: GalleryItem) => void
}

export function JustifiedGallery({
  items,
  title = "Your generations",
  grouped = false,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyState,
  onDelete,
}: JustifiedGalleryProps) {
  const reducedMotion = useReducedMotion()
  const { viewportRef, ...gallery } = useJustifiedGallery(items, grouped, {
    hasMore,
    loadingMore,
    onLoadMore,
  })
  const viewBottom = gallery.scrollTop + gallery.viewportHeight

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex shrink-0 items-center justify-between gap-4 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          {title != null ? (
            <h1 className="text-q-headline-sm-semi-bold whitespace-nowrap">
              {title}
            </h1>
          ) : null}
          {gallery.loadingMore ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Loading
            </span>
          ) : null}
        </div>
        <DensityControl value={gallery.density} onChange={gallery.setDensity} />
      </header>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-y-auto [overscroll-behavior:contain]"
      >
        {gallery.itemCount === 0 ? (
          <ScreenEmptyState className="h-full" {...emptyState} />
        ) : (
          <div
            className="relative w-full"
            style={{ height: gallery.layout.totalHeight }}
          >
            {gallery.visibleRows.map((row) => {
              if (row.type === "header") {
                return (
                  <div
                    key={row.key}
                    className="absolute inset-x-0 flex items-end px-0.5 pb-2"
                    style={{ top: row.y, height: row.height }}
                  >
                    <h3 className="text-xs font-medium text-muted-foreground">
                      {row.label}
                    </h3>
                  </div>
                )
              }
              const visible =
                row.y < viewBottom && row.y + row.height > gallery.scrollTop
              const tier: LoadTier = visible ? "full" : "near"
              return row.tiles!.map((rect) => (
                <GalleryTile
                  key={rect.item.id}
                  item={rect.item}
                  rect={rect}
                  top={row.y}
                  tier={tier}
                  reducedMotion={reducedMotion}
                  onDelete={onDelete}
                />
              ))
            })}
          </div>
        )}
      </div>
    </div>
  )
}
