"use client"

import { useState } from "react"
import type { FormEvent, ReactElement } from "react"
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** Name form shared by create and rename. */
function NameDialog({
  trigger,
  title,
  description,
  initial = "",
  submitLabel,
  onSubmit,
  open,
  onOpenChange,
}: {
  trigger?: ReactElement
  title: string
  description: string
  initial?: string
  submitLabel: string
  onSubmit: (name: string) => void | Promise<void>
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await onSubmit(name.trim())
      onOpenChange?.(false)
      setName("")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent size="xs">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              <p className="text-q-body-sm-regular text-q-text-secondary">
                {description}
              </p>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
                aria-label="Project name"
                maxLength={80}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectCreateModal({
  trigger,
  onCreate,
}: {
  trigger: ReactElement
  onCreate: (name: string) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  return (
    <NameDialog
      trigger={trigger}
      open={open}
      onOpenChange={setOpen}
      title="New project"
      description="Group generations under one name."
      submitLabel="Create"
      onSubmit={onCreate}
    />
  )
}

/** Hover ⋯ menu on a sidebar project row: rename or delete. */
export function ProjectActions({
  projectName,
  onRename,
  onDelete,
  className,
}: {
  projectName: string
  onRename: (name: string) => void | Promise<void>
  onDelete: () => void | Promise<void>
  className?: string
}) {
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${projectName}`}
          className={cn("q-close q-close-sm", className)}
          onClick={(e) => e.stopPropagation()}
        >
          <EllipsisVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleting(true)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename project"
        description="Only the name changes; generations stay linked."
        initial={projectName}
        submitLabel="Rename"
        onSubmit={onRename}
      />
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent size="xs">
          <DialogHeader>
            <DialogTitle>Delete “{projectName}”?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-q-body-sm-regular text-q-text-secondary">
              The project goes away. Its generations stay in All Generations.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await onDelete()
                setDeleting(false)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
