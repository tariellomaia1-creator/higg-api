"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "cn"

/**
 * Tabs — Base UI `Tabs` with the Quanta skin (q-tabs-* from
 * styles/quanta/components/tabs.css). `variant` picks the Figma family:
 * `underline` (default), `pill` (text pills on a sliding fill), `segmented`
 * (glass segmented control, use `shape="pill"` for the rounded track), `soft`.
 */

export type TabsVariant = "underline" | "pill" | "segmented" | "soft"
export type TabsShape = "rounded" | "pill" | "icon"
export type TabsTone =
  "default" | "accent" | "glass" | "solid" | "brandSoft" | "brand"

const VARIANT_CLASS: Record<TabsVariant, string> = {
  underline: "q-tabs-underline",
  pill: "q-tabs-pill",
  segmented: "q-tabs-segmented",
  soft: "q-tabs-soft",
}
const SHAPE_CLASS: Record<TabsShape, string> = {
  rounded: "q-tabs-shape-rounded",
  pill: "q-tabs-shape-pill",
  icon: "q-tabs-shape-icon",
}
const TONE_CLASS: Record<TabsTone, string> = {
  default: "q-tabs-tone-default",
  accent: "q-tabs-tone-accent",
  glass: "q-tabs-tone-glass",
  solid: "q-tabs-tone-solid",
  brandSoft: "q-tabs-tone-brand-soft",
  brand: "q-tabs-tone-brand",
}

function Tabs({
  className,
  variant = "underline",
  shape = "rounded",
  tone,
  ...props
}: TabsPrimitive.Root.Props & {
  variant?: TabsVariant
  shape?: TabsShape
  tone?: TabsTone
}) {
  const resolvedTone = tone ?? (variant === "segmented" ? "glass" : "default")
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn(
        "q-tabs",
        VARIANT_CLASS[variant],
        SHAPE_CLASS[shape],
        "q-tabs-surface-glass",
        TONE_CLASS[resolvedTone],
        className
      )}
      {...props}
    />
  )
}

function TabsList({
  className,
  children,
  indicator = true,
  fullWidth = false,
  ...props
}: TabsPrimitive.List.Props & { indicator?: boolean; fullWidth?: boolean }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("q-tabs-list", fullWidth && "q-tabs-list-fill", className)}
      {...props}
    >
      {children}
      {indicator ? (
        <TabsPrimitive.Indicator
          className="q-tabs-indicator"
          renderBeforeHydration
        />
      ) : null}
    </TabsPrimitive.List>
  )
}

/** Wrap text in a width-locking span so weight changes on select don't shift neighbours. */
function lockTextWidth(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) =>
    typeof child === "string" || typeof child === "number" ? (
      <span className="q-tabs-tab-text" data-text={String(child)}>
        {child}
      </span>
    ) : (
      child
    )
  )
}

function TabsTrigger({
  className,
  children,
  start,
  end,
  iconOnly = false,
  ...props
}: TabsPrimitive.Tab.Props & {
  start?: React.ReactNode
  end?: React.ReactNode
  iconOnly?: boolean
}) {
  const slots = start != null || end != null
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "q-tabs-tab",
        iconOnly && "q-tabs-tab-icon-only",
        className
      )}
      {...props}
    >
      <span className="q-tabs-tab-content">
        {slots ? (
          <>
            {start != null ? (
              <span className="q-tabs-tab-icon">{start}</span>
            ) : null}
            {children != null ? (
              <span className="q-tabs-tab-label">
                {lockTextWidth(children)}
              </span>
            ) : null}
            {end != null ? (
              <span className="q-tabs-tab-icon">{end}</span>
            ) : null}
          </>
        ) : (
          lockTextWidth(children)
        )}
      </span>
    </TabsPrimitive.Tab>
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("q-tabs-panel", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
