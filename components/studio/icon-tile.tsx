import type { ComponentPropsWithRef } from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * IconTile — a 24px leading tile for navigation rows. Pass a brand `gradient`
 * for a colored tile with a white glyph, or omit it for the neutral raised tile.
 */
export type IconTileGradient =
  "blue" | "teal" | "purple" | "pink" | "orange" | "green" | "red" | "indigo"

export const ICON_TILE_GRADIENT: Record<IconTileGradient, string> = {
  blue: "linear-gradient(135deg, rgb(65, 136, 190) 0%, rgb(14, 39, 114) 100%)",
  teal: "linear-gradient(135deg, rgb(81, 226, 224) 3.8675%, rgb(18, 92, 141) 93.451%)",
  purple:
    "linear-gradient(135deg, rgb(158, 120, 226) 0%, rgb(63, 26, 130) 100%)",
  pink: "linear-gradient(135deg, rgb(226, 110, 178) 0%, rgb(130, 20, 74) 100%)",
  orange:
    "linear-gradient(135deg, rgb(245, 168, 88) 0%, rgb(168, 66, 18) 100%)",
  green: "linear-gradient(135deg, rgb(104, 205, 128) 0%, rgb(20, 96, 58) 100%)",
  red: "linear-gradient(135deg, rgb(235, 108, 104) 0%, rgb(140, 22, 34) 100%)",
  indigo:
    "linear-gradient(135deg, rgb(110, 128, 226) 0%, rgb(30, 34, 130) 100%)",
}

export type IconTileProps = ComponentPropsWithRef<"span"> & {
  as: LucideIcon
  gradient?: IconTileGradient | (string & {})
}

export function IconTile({
  as: Glyph,
  gradient,
  className,
  style,
  ...props
}: IconTileProps) {
  const backgroundImage = gradient
    ? (ICON_TILE_GRADIENT[gradient as IconTileGradient] ?? gradient)
    : undefined
  return (
    <span
      className={cn(
        "relative inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md",
        gradient
          ? "border border-white/20 text-white shadow-[0_4px_2px_rgba(0,0,0,0.08),inset_0_2px_4px_rgba(255,255,255,0.24)]"
          : "border border-white/10 bg-white/5 text-muted-foreground",
        className
      )}
      style={gradient ? { backgroundImage, ...style } : style}
      {...props}
    >
      <Glyph
        aria-hidden
        className="size-3.5"
        fill={gradient ? "currentColor" : "none"}
      />
    </span>
  )
}
