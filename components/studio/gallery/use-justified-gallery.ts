"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { RefObject } from "react"
import { JustifiedLayoutEngine } from "./justified-engine"
import type { Layout, LayoutRow } from "./justified-engine"
import type { GalleryItem } from "./gallery-types"

/**
 * Tile-size presets, indexed by the slider step. The slider runs left → right =
 * smaller → LARGER tiles, so this array is ASCENDING: step 0 is the smallest /
 * densest, the last step the largest / least-dense. The value is the target row
 * height in px that the engine packs against. The scale is biased toward larger
 * tiles (base default sits above the old minimum) since the small end read too
 * cramped.
 */
export const DENSITY_ROW_HEIGHTS = [220, 280, 360, 460, 580] as const
export const DEFAULT_DENSITY = 1

const GAP = 6
/** Rows within this many px of the viewport edge are rendered (windowing). */
const OVERSCAN_PX = 400
/** Load the next batch when the viewport bottom is within this px of the end. */
const INFINITE_MARGIN = 1200

interface InfiniteScrollOptions {
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void | Promise<unknown>
}

export interface UseJustifiedGalleryResult {
  viewportRef: RefObject<HTMLDivElement | null>
  layout: Layout
  /** The [startRow, endRow) slice of rows currently rendered. */
  visibleRows: LayoutRow[]
  /** Current scroll offset (px) — used to classify each tile's load tier. */
  scrollTop: number
  viewportHeight: number
  density: number
  setDensity: (level: number) => void
  itemCount: number
  loadingMore: boolean
}

export function useJustifiedGallery(
  items: GalleryItem[],
  grouped = true,
  {
    hasMore = false,
    loadingMore = false,
    onLoadMore,
  }: InfiniteScrollOptions = {}
): UseJustifiedGalleryResult {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [density, setDensityState] = useState(DEFAULT_DENSITY)
  const [viewportHeight, setViewportHeight] = useState(0)
  // Snapshot scroll position only when the rendered row window changes.
  const [range, setRange] = useState({ startRow: 0, endRow: 0, scrollTop: 0 })

  const allItems = items

  const targetRowHeight =
    DENSITY_ROW_HEIGHTS[density] ?? DENSITY_ROW_HEIGHTS[DEFAULT_DENSITY]!

  const engine = useMemo(() => {
    const next = new JustifiedLayoutEngine()
    next.setItems(allItems)
    next.setConfig({
      containerWidth: width,
      targetRowHeight,
      gap: GAP,
      grouped,
    })
    return next
  }, [allItems, width, targetRowHeight, grouped])
  const layout = useMemo(() => engine.getLayout(), [engine])

  // Anchor captured on the last scroll frame (against the pre-change layout) so
  // a density change or resize can re-pin the same item under the viewport.
  const anchorRef = useRef({ index: 0, offset: 0 })

  const readRange = useCallback(() => {
    const el = viewportRef.current
    if (el == null) return
    const st = el.scrollTop
    const vh = el.clientHeight
    const win = engine.getWindow(st, vh, OVERSCAN_PX)
    setViewportHeight(vh)
    setRange((prev) =>
      prev.startRow === win.startRow && prev.endRow === win.endRow
        ? prev
        : { ...win, scrollTop: st }
    )
  }, [engine])

  // Measure width + height with a ResizeObserver.
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (el == null || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth)
      setViewportHeight(el.clientHeight)
    })
    ro.observe(el)
    setWidth(el.clientWidth)
    setViewportHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // After any re-layout (width / density / items), recompute the window and
  // restore the scroll anchor so the visible content stays stable.
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (el == null) return
    const anchor = anchorRef.current
    if (anchor.index > 0) {
      const nextTop = engine.getItemTop(anchor.index) + anchor.offset
      if (Math.abs(nextTop - el.scrollTop) > 0.5) el.scrollTop = nextTop
    }
    readRange()
    // Depend on the layout object identity, which changes on every recompute.
  }, [engine, layout, readRange])

  // Keep a stable loader that reads the freshest counts via refs.
  const loadingRef = useRef(false)
  const lastAutoLoadKeyRef = useRef<string | null>(null)
  const feedEdgeKey = `${allItems.length}:${allItems[0]?.id ?? ""}:${allItems.at(-1)?.id ?? ""}`

  const triggerLoadMore = useCallback(() => {
    if (loadingRef.current) return
    if (loadingMore || !hasMore || onLoadMore == null) return
    // A resolved empty/duplicate page must not recursively drain the cursor.
    if (lastAutoLoadKeyRef.current === feedEdgeKey) return
    lastAutoLoadKeyRef.current = feedEdgeKey
    loadingRef.current = true
    // The owner surfaces failures and retry UI; catch only to avoid an unhandled rejection.
    void Promise.resolve(onLoadMore?.())
      .catch(() => undefined)
      .finally(() => {
        loadingRef.current = false
      })
  }, [feedEdgeKey, hasMore, loadingMore, onLoadMore])

  // A short page should keep paging until the viewport can scroll. Re-evaluate
  // when a request settles even if the resulting geometry did not change.
  useEffect(() => {
    const el = viewportRef.current
    if (
      el != null &&
      width > 0 &&
      el.clientHeight > 0 &&
      el.scrollTop + el.clientHeight >= layout.totalHeight - INFINITE_MARGIN
    ) {
      triggerLoadMore()
    }
  }, [layout.totalHeight, loadingMore, triggerLoadMore, width])

  // Scroll handling: rAF-throttled window recompute + infinite-scroll trigger.
  // Media stays mounted while scrolling so completed images never disappear.
  useEffect(() => {
    const el = viewportRef.current
    if (el == null) return

    let raf = 0

    const onScroll = () => {
      if (raf !== 0) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const st = el.scrollTop

        // Capture the anchor for the next density/resize re-layout.
        anchorRef.current = engine.findAnchor(st)

        readRange()

        // Infinite scroll: append an older batch as the bottom nears.
        const nearBottom =
          st + el.clientHeight >=
          engine.getLayout().totalHeight - INFINITE_MARGIN
        if (nearBottom) triggerLoadMore()
      })
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      el.removeEventListener("scroll", onScroll)
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [engine, readRange, triggerLoadMore])

  const setDensity = useCallback(
    (level: number) => {
      // The anchor was captured on the last scroll frame; refresh it against the
      // live scroll position right now so the re-pin is exact even without a
      // recent scroll event.
      const el = viewportRef.current
      if (el != null) anchorRef.current = engine.findAnchor(el.scrollTop)
      setDensityState(level)
    },
    [engine]
  )

  const visibleRows = useMemo(
    () => layout.rows.slice(range.startRow, range.endRow),
    [layout, range.startRow, range.endRow]
  )

  return {
    viewportRef,
    layout,
    visibleRows,
    scrollTop: range.scrollTop,
    viewportHeight,
    density,
    setDensity,
    itemCount: allItems.length,
    loadingMore,
  }
}
