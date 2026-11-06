import type { Metadata } from "next"

import { Gallery } from "@/components/daily/gallery"

export const metadata: Metadata = { title: "გალერეა · BeHero Daily" }

export default function GalleryPage() {
  return <Gallery />
}
