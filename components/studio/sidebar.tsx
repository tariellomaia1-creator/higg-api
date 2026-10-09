/* eslint-disable @next/next/no-img-element */
"use client"

import type { ReactNode } from "react"
import {
  House,
  Images,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { IconTile } from "./icon-tile"
import type { MyProjectsProject } from "./my-projects"
import { ProjectActions, ProjectCreateModal } from "./project-dialogs"

/**
 * StudioSidebar — the projects-first left rail: Home, All Generations, then the
 * project list with hover actions. Collapses to a 56px icon rail.
 */
export type StudioView =
  { kind: "home" } | { kind: "all" } | { kind: "project"; projectId: string }

export interface StudioSidebarProps {
  title: string
  logo?: ReactNode
  view: StudioView
  onViewChange: (view: StudioView) => void
  projects: MyProjectsProject[]
  onCreateProject: (name: string) => void | Promise<void>
  onRenameProject: (projectId: string, name: string) => void | Promise<void>
  onDeleteProject: (projectId: string) => void | Promise<void>
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  keyConfigured: boolean
  onOpenKey: () => void
}

function Row({
  selected,
  collapsed,
  start,
  title,
  meta,
  action,
  onClick,
  ariaLabel,
}: {
  selected?: boolean
  collapsed: boolean
  start: ReactNode
  title: ReactNode
  meta?: ReactNode
  action?: ReactNode
  onClick?: () => void
  ariaLabel?: string
}) {
  const row = (
    <div
      className={cn(
        "group relative flex h-9 items-center gap-2.5 rounded-lg px-1.5 text-sm transition-colors",
        selected
          ? "bg-white/8 text-foreground"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
        collapsed && "justify-center px-0"
      )}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-current={selected ? "page" : undefined}
        className="absolute inset-0 z-[1] rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onClick}
      />
      <span className="pointer-events-none relative shrink-0">{start}</span>
      {!collapsed ? (
        <>
          <span className="pointer-events-none relative min-w-0 flex-1 truncate font-medium">
            {title}
          </span>
          {meta != null ? (
            <span
              className={cn(
                "pointer-events-none relative text-xs text-muted-foreground tabular-nums",
                action &&
                  "group-focus-within:hidden group-hover:hidden group-has-[[data-popup-open]]:hidden"
              )}
            >
              {meta}
            </span>
          ) : null}
          {action ? (
            <span className="relative z-[2] hidden group-focus-within:inline-flex group-hover:inline-flex has-[[data-popup-open]]:inline-flex">
              {action}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  )
  if (!collapsed || typeof title !== "string") return row
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block" />}>{row}</TooltipTrigger>
      <TooltipContent side="right">{title}</TooltipContent>
    </Tooltip>
  )
}

export function StudioSidebar({
  title,
  logo,
  view,
  onViewChange,
  projects,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  collapsed,
  onCollapsedChange,
  keyConfigured,
  onOpenKey,
}: StudioSidebarProps) {
  return (
    <aside
      className={cn(
        "m-2.5 flex h-[calc(100dvh-20px)] shrink-0 flex-col rounded-xl border border-sidebar-border bg-sidebar p-2 text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-14" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-1 pb-2",
          collapsed && "flex-col"
        )}
      >
        <span className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
          {logo ?? title.slice(0, 1).toUpperCase()}
        </span>
        {!collapsed ? (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {title}
          </span>
        ) : null}
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-0.5">
          <Row
            collapsed={collapsed}
            selected={view.kind === "home"}
            onClick={() => onViewChange({ kind: "home" })}
            start={<IconTile as={House} gradient="blue" />}
            title="Home"
            ariaLabel="Home"
          />
          <Row
            collapsed={collapsed}
            selected={view.kind === "all"}
            onClick={() => onViewChange({ kind: "all" })}
            start={<IconTile as={Images} gradient="purple" />}
            title="All Generations"
            ariaLabel="All Generations"
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <div
            className={cn(
              "flex items-center justify-between px-1.5 pb-1",
              collapsed && "justify-center px-0"
            )}
          >
            {!collapsed ? (
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Projects
              </span>
            ) : null}
            <ProjectCreateModal
              onCreate={onCreateProject}
              trigger={
                <button
                  type="button"
                  aria-label="New project"
                  className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Plus className="size-4" />
                </button>
              }
            />
          </div>
          {projects.map((project) => (
            <Row
              key={project.id}
              collapsed={collapsed}
              selected={
                view.kind === "project" && view.projectId === project.id
              }
              onClick={() =>
                onViewChange({ kind: "project", projectId: project.id })
              }
              ariaLabel={project.name}
              start={
                <span className="flex size-6 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/5 text-[11px] font-semibold text-muted-foreground">
                  {project.cover ? (
                    <img
                      src={project.cover}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    project.name.slice(0, 1).toUpperCase()
                  )}
                </span>
              }
              title={project.name}
              meta={project.generationCount.toLocaleString("en-US")}
              action={
                <ProjectActions
                  projectName={project.name}
                  onRename={(name) => onRenameProject(project.id, name)}
                  onDelete={() => onDeleteProject(project.id)}
                />
              }
            />
          ))}
          {projects.length === 0 && !collapsed ? (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              No projects yet.
            </p>
          ) : null}
        </div>
      </nav>

      <div className="pt-2">
        <Row
          collapsed={collapsed}
          onClick={onOpenKey}
          ariaLabel={keyConfigured ? "Manage API key" : "Connect API key"}
          start={
            <span className="relative flex size-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-muted-foreground">
              <KeyRound className="size-3.5" />
              <span
                className={cn(
                  "absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-sidebar",
                  keyConfigured ? "bg-primary" : "bg-destructive"
                )}
                aria-hidden
              />
            </span>
          }
          title={keyConfigured ? "API key saved" : "Connect API key"}
        />
      </div>
    </aside>
  )
}
