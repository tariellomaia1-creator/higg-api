/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface ScreenEmptyStateContent {
  images: readonly [string, string, string]
  title: ReactNode
  description: ReactNode
}

export interface ScreenEmptyStateProps extends ScreenEmptyStateContent {
  action?: ReactNode
  className?: string
}

const DOTS_MASK =
  "radial-gradient(ellipse 70% 65% at 50% 50%, #000 0%, transparent 78%)"

/** Shared full-screen empty state. The preview shows representative generations from this app. */
export function ScreenEmptyState({
  images,
  title,
  description,
  action,
  className,
}: ScreenEmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-12 text-center",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: DOTS_MASK,
          WebkitMaskImage: DOTS_MASK,
        }}
      />
      <div className="relative flex w-full max-w-[444px] flex-col items-center gap-6">
        <div className="relative h-[105px] w-full" aria-hidden>
          <div className="absolute top-2.5 left-0 h-[85px] w-[38%] overflow-hidden rounded-2xl opacity-70">
            <img src={images[0]} alt="" className="size-full object-cover" />
            <span className="absolute inset-0 bg-black/30" />
          </div>
          <div className="absolute top-2.5 right-0 h-[85px] w-[38%] overflow-hidden rounded-2xl opacity-70">
            <img src={images[2]} alt="" className="size-full object-cover" />
            <span className="absolute inset-0 bg-black/30" />
          </div>
          <div className="absolute inset-y-0 left-1/2 z-[1] w-[41.5%] -translate-x-1/2 overflow-hidden rounded-[20px] border border-white/10 bg-white/5 shadow-[inset_0_0_20px_rgba(255,255,255,0.48),0_8px_24px_rgba(0,0,0,0.24)]">
            <img src={images[1]} alt="" className="size-full object-cover" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <h2 className="text-q-headline-sm-semi-bold text-foreground">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action != null ? (
          <div className="flex items-center justify-center">{action}</div>
        ) : null}
      </div>
    </div>
  )
}
