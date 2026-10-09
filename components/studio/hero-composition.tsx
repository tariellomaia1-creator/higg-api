/* eslint-disable @next/next/no-img-element */

export interface HeroCompositionProps {
  images: readonly [string, string, string]
  alt?: string
}

/**
 * Three-shot hero identity: two supporting frames behind one larger focal frame.
 * The images are app content, not decoration; an adapted app replaces all
 * three with a coherent, product-specific set (or its latest real outputs).
 */
export function HeroComposition({ images, alt = "" }: HeroCompositionProps) {
  return (
    <div
      className="relative h-[106px] w-[372px] max-w-[calc(100vw-3rem)]"
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      <div className="absolute top-2.5 left-0 h-[88px] w-[42%] overflow-hidden rounded-2xl opacity-80">
        <img src={images[0]} alt="" className="size-full object-cover" />
        <span aria-hidden className="absolute inset-0 bg-black/20" />
      </div>
      <div className="absolute top-2.5 right-0 h-[88px] w-[42%] overflow-hidden rounded-2xl opacity-80">
        <img src={images[2]} alt="" className="size-full object-cover" />
        <span aria-hidden className="absolute inset-0 bg-black/20" />
      </div>
      <div className="absolute top-0 left-1/2 z-[1] h-[106px] w-[50.25%] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-card shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <img src={images[1]} alt="" className="size-full object-cover" />
      </div>
    </div>
  )
}
