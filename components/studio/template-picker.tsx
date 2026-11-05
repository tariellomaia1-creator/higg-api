/* eslint-disable @next/next/no-img-element */
"use client"

import type { KeyboardEvent, ReactNode } from "react"
import {
  Building2,
  Clapperboard,
  GraduationCap,
  Mountain,
  Package,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Templates — the "what you can make" examples. A `TemplateItem` seeds the
 * prompt dock (prompt text + optional model/settings) when its Try action fires.
 * `TemplateCard` and `ExamplePresets` render them; the Explore tab on Home uses
 * `ExamplePresets`.
 */

// BeHero preset art, 3:4 portrait.
const ART = {
  lesson: "/presets/lesson.svg",
  mountains: "/presets/mountains.svg",
  city: "/presets/city.svg",
  product: "/presets/product.svg",
  portrait: "/presets/portrait.svg",
  series: "/presets/series.svg",
} as const

export interface TemplateItem {
  id: string
  title: string
  subtitle: string
  /** Free-form filter category used by the picker tabs. */
  category: string
  kind: "image" | "video"
  images: [string, string, string]
  icon: LucideIcon
  /** What the Try action puts in the dock. */
  prompt: string
  /** Catalog model id to switch to, when the template needs a specific one. */
  modelId?: string
  settings?: Record<string, unknown>
  /** Opens a guided flow instead of seeding the dock. */
  opens?: "series"
}

export const TEMPLATES: TemplateItem[] = [
  {
    id: "b2b-series",
    title: "B2B mini-series",
    subtitle: "3 vertical episodes about your brand",
    category: "commercial",
    kind: "video",
    images: [ART.series, ART.lesson, ART.product],
    icon: Clapperboard,
    prompt: "",
    opens: "series",
  },
  {
    id: "lesson-intro",
    title: "Lesson intro",
    subtitle: "Opening shot for a video lesson",
    category: "education",
    kind: "video",
    images: [ART.lesson, ART.portrait, ART.city],
    icon: GraduationCap,
    prompt:
      "Slow push-in on a chalkboard in a warm classroom at dusk, chalk formulas glowing softly, books and an apple on the desk, dust drifting through a single lamp beam, cinematic and calm.",
  },
  {
    id: "caucasus-drone",
    title: "Caucasus drone shot",
    subtitle: "Sunset flight over the peaks",
    category: "travel",
    kind: "video",
    images: [ART.mountains, ART.city, ART.lesson],
    icon: Mountain,
    prompt:
      "Aerial drone shot gliding over snow-capped Caucasus mountains at sunset, an old stone watchtower on the ridge, golden haze in the valleys, smooth forward motion.",
  },
  {
    id: "tbilisi-night",
    title: "Tbilisi at night",
    subtitle: "Old town lights on the river",
    category: "travel",
    kind: "image",
    images: [ART.city, ART.mountains, ART.portrait],
    icon: Building2,
    prompt:
      "Night view of Tbilisi old town from across the Mtkvari river, a glowing modern footbridge, church domes and warm window lights reflected in the water, moon over the hills.",
  },
  {
    id: "product-hero",
    title: "Product hero shot",
    subtitle: "Studio light, slow orbit",
    category: "commercial",
    kind: "video",
    images: [ART.product, ART.portrait, ART.lesson],
    icon: Package,
    prompt:
      "Cinematic product hero shot of a green glass bottle on a dark pedestal, slow orbit, soft top light and rim light, dust particles catching the beam.",
  },
]

function gradientFromSeed(seed: string): string {
  let hash = 0
  for (const c of seed) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  const start = hash % 360
  const end = (start + 36 + ((hash >>> 8) % 72)) % 360
  return `linear-gradient(135deg, hsl(${start} 62% 52%) 0%, hsl(${end} 76% 27%) 100%)`
}

function GradientBadge({ as: Glyph, seed }: { as: LucideIcon; seed: string }) {
  return (
    <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-white/25 text-white shadow-[0_5px_3px_rgba(0,0,0,0.08),inset_0_3px_5px_rgba(255,255,255,0.24)]">
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundImage: gradientFromSeed(seed) }}
      />
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20 mix-blend-overlay"
      />
      <Glyph className="relative size-5" />
    </span>
  )
}

const TRIPTYCH = [
  "rounded-l-2xl rounded-r-sm",
  "rounded-sm",
  "rounded-r-2xl rounded-l-sm",
] as const

export interface TemplateCardProps {
  template: TemplateItem
  variant?: "single" | "triptych"
  onTry: (template: TemplateItem) => void
  tryLabel?: ReactNode
}

export function TemplateCard({
  template,
  variant = "single",
  onTry,
  tryLabel = "Try",
}: TemplateCardProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onTry(template)
    }
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Use template: ${template.title}`}
      className="relative flex cursor-pointer flex-col gap-2 rounded-[20px] bg-white/5 p-2 shadow-[0_2px_6px_rgba(0,0,0,0.15)] transition-[transform,background-color] duration-200 hover:z-[1] hover:-translate-y-0.5 hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:hover:translate-y-0"
      onClick={() => onTry(template)}
      onKeyDown={onKeyDown}
    >
      <div className="flex h-60 items-stretch gap-1.5">
        {variant === "triptych" ? (
          template.images.map((src, i) => (
            <div
              key={i}
              className={cn(
                "min-w-0 flex-1 overflow-hidden border border-white/10",
                TRIPTYCH[i]
              )}
            >
              <img
                src={src}
                alt={`${template.title} — shot ${i + 1}`}
                className="size-full object-cover"
              />
            </div>
          ))
        ) : (
          <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/10">
            <img
              src={template.images[0]}
              alt={template.title}
              className="size-full object-cover"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 px-2 py-1">
        <GradientBadge as={template.icon} seed={template.id} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">
            {template.title}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {template.subtitle}
          </span>
        </div>
        <Button
          size="sm"
          className="rounded-full font-semibold"
          onClick={(event) => {
            event.stopPropagation()
            onTry(template)
          }}
        >
          {tryLabel}
        </Button>
      </div>
    </div>
  )
}

export interface ExamplePresetsProps {
  items: TemplateItem[]
  onUse: (template: TemplateItem) => void
  tryLabel?: ReactNode
  className?: string
}

/** The Explore grid: two columns of `TemplateCard`s. */
export function ExamplePresets({
  items,
  onUse,
  tryLabel = "Try",
  className = "w-full max-w-[900px]",
}: ExamplePresetsProps) {
  return (
    <div
      className={cn("grid w-full grid-cols-1 gap-5 sm:grid-cols-2", className)}
    >
      {items.map((t) => (
        <TemplateCard
          key={t.id}
          template={t}
          onTry={onUse}
          tryLabel={tryLabel}
        />
      ))}
    </div>
  )
}
