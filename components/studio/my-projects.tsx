/* eslint-disable @next/next/no-img-element */
"use client"

import { useMemo } from "react"
import { Plus } from "lucide-react"

import type { GalleryItem } from "@/components/studio/gallery/gallery-types"
import { cn } from "@/lib/utils"

import { ProjectCreateModal } from "./project-dialogs"

export interface MyProjectsProject {
  id: string
  name: string
  generationCount: number
  cover?: string
  updatedAt?: number
}

export interface MyProjectsProps {
  projects: MyProjectsProject[]
  generations: GalleryItem[]
  onCreateProject: (name: string) => void | Promise<void>
  onOpenAllGenerations: () => void
  onOpenProject: (project: MyProjectsProject) => void
  className?: string
}

function previewImages(
  project: MyProjectsProject | undefined,
  matching: readonly string[]
) {
  return Array.from(
    { length: 5 },
    (_, i) => matching[i] ?? (i === 0 ? project?.cover : undefined)
  )
}

function Preview({ src, className }: { src?: string; className: string }) {
  return src ? (
    <img src={src} alt="" className={className} />
  ) : (
    <div aria-hidden className={cn(className, "bg-white/6")} />
  )
}

function Mosaic({ images }: { images: Array<string | undefined> }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_80px_80px] gap-3">
      <Preview
        src={images[0]}
        className="size-full min-h-0 rounded-lg object-cover"
      />
      {[1, 3].map((start) => (
        <div key={start} className="grid min-h-0 grid-rows-2 gap-3">
          <Preview
            src={images[start]}
            className="size-full min-h-0 rounded-lg object-cover"
          />
          <Preview
            src={images[start + 1]}
            className="size-full min-h-0 rounded-lg object-cover"
          />
        </div>
      ))}
    </div>
  )
}

const CARD =
  "relative flex h-[248px] min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-white/10 bg-card p-3 shadow-[0_8px_24px_rgba(0,0,0,0.25)]"

export function ProjectCard({
  title,
  subtitle,
  images,
  onOpen,
}: {
  title: string
  subtitle: string
  images: Array<string | undefined>
  onOpen: () => void
}) {
  return (
    <article className={CARD}>
      <div className="flex min-w-0 flex-col gap-0.5 px-1">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        <p className="truncate text-xs font-medium text-muted-foreground">
          {subtitle}
        </p>
      </div>
      <Mosaic images={images} />
      <button
        type="button"
        aria-label={`Open ${title}`}
        className="absolute inset-0 z-[1] cursor-pointer rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        onClick={onOpen}
      />
    </article>
  )
}

/** My Projects — the project overview grid on Home. */
export function MyProjects({
  projects,
  generations,
  onCreateProject,
  onOpenAllGenerations,
  onOpenProject,
  className,
}: MyProjectsProps) {
  const previews = useMemo(() => {
    const ordered = generations.filter(
      (g) => g.status === "ready" && g.src !== ""
    )
    const byProject = new Map<string, string[]>()
    for (const item of ordered) {
      if (!item.projectId) continue
      const list = byProject.get(item.projectId) ?? []
      if (list.length < 5) list.push(item.src)
      byProject.set(item.projectId, list)
    }
    return { all: ordered.slice(0, 5).map((g) => g.src), byProject }
  }, [generations])

  return (
    <div
      className={cn(
        "grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-6",
        className
      )}
    >
      <ProjectCreateModal
        onCreate={onCreateProject}
        trigger={
          <button
            type="button"
            className={cn(
              CARD,
              "items-center justify-center hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-foreground">
              <Plus className="size-5" />
            </span>
            <span className="text-sm font-semibold">New project</span>
          </button>
        }
      />
      <ProjectCard
        title="All Generations"
        subtitle={`${generations.length.toLocaleString("en-US")} generations`}
        images={previewImages(undefined, previews.all)}
        onOpen={onOpenAllGenerations}
      />
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          title={project.name}
          subtitle={`${project.generationCount.toLocaleString("en-US")} generations  •  Private`}
          images={previewImages(
            project,
            previews.byProject.get(project.id) ?? []
          )}
          onOpen={() => onOpenProject(project)}
        />
      ))}
    </div>
  )
}
