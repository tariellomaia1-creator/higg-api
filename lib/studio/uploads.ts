import { create } from "zustand"
import { persist } from "zustand/middleware"

import { browserStorage } from "@/generation/stores/browser-storage"
import { uploadMedia } from "@/generation/upload"
import { mediaKindFromMime } from "@/generation/upload-contract"
import type { MediaKind } from "@/generation/catalog/types"

export type AssetKind = MediaKind

/** A durable, submit-ready media reference: `src` is a public URL the platform can fetch. */
export interface AssetSelection {
  id: string
  src: string
  kind: AssetKind
  name?: string
}

export interface AssetLibraryItem extends AssetSelection {
  source: "upload" | "generation"
  createdAt: number
}

type UploadsState = {
  items: AssetLibraryItem[]
  add: (item: AssetLibraryItem) => void
  remove: (id: string) => void
}

/** Remember uploaded reference URLs in this browser. */
export const useUploads = create<UploadsState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((s) => ({
          items: [item, ...s.items.filter((i) => i.id !== item.id)].slice(
            0,
            200
          ),
        })),
      remove: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
    }),
    { name: "hf.uploads.v1", storage: browserStorage() }
  )
)

export function kindOf(file: File): AssetKind {
  return mediaKindFromMime(file.type)
}

/** Record a reference only after the Higgsfield storage upload succeeds. */
export async function uploadAsset(file: File): Promise<AssetLibraryItem> {
  const { url } = await uploadMedia(file)
  const item: AssetLibraryItem = {
    id: url,
    src: url,
    kind: kindOf(file),
    name: file.name,
    source: "upload",
    createdAt: Date.now(),
  }
  useUploads.getState().add(item)
  return item
}
