import type { GalleryItem } from "@/components/studio/gallery/gallery-types"
import type { AssetLibraryItem } from "@/lib/studio/uploads"

import type { RunRecord } from "./history"

/** One feed tile per result URL; a running or failed run is a single placeholder tile. */
export function runToGalleryItems(run: RunRecord): GalleryItem[] {
  const base = {
    runId: run.id,
    ...(run.projectId ? { projectId: run.projectId } : {}),
    createdAt: run.createdAt,
    width: run.aspect,
    height: 1,
    prompt: run.prompt,
    alt: run.prompt || run.modelLabel,
    modelLabel: run.modelLabel,
    settings: run.settings,
    groupId: "all",
    groupLabel: "",
  }
  if (run.status !== "completed") {
    return [
      {
        ...base,
        id: run.id,
        kind: run.surface,
        status: run.status === "running" ? "generating" : "failed",
        src: "",
        ...(run.error ? { failureLabel: run.error } : {}),
      },
    ]
  }
  return run.urls.map((url, index) => ({
    ...base,
    id: run.urls.length > 1 ? `${run.id}:${index}` : run.id,
    kind: run.surface,
    status: "ready",
    src: run.surface === "video" ? "" : url,
    ...(run.surface === "video" ? { videoSrc: url } : {}),
  }))
}

export function runToLibraryItems(run: RunRecord): AssetLibraryItem[] {
  if (run.status !== "completed") return []
  return run.urls.map((url) => ({
    id: url,
    src: url,
    kind: run.surface,
    name: run.prompt.slice(0, 60),
    source: "generation",
    createdAt: run.createdAt,
  }))
}
