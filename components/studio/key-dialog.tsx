"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import { KeyRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  clearPlatformCredentials,
  savePlatformCredentials,
} from "@/generation/actions"

/**
 * API key dialog. A server action stores the submitted key in an httpOnly
 * cookie; the studio only reads whether one is set.
 */
export function KeyDialog({
  open,
  onOpenChange,
  configured,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  configured: boolean
  onChange: (configured: boolean) => void
}) {
  const [apiKey, setApiKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await savePlatformCredentials({ api_key: apiKey })
      setApiKey("")
      onChange(true)
      onOpenChange(false)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the key"
      )
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      await clearPlatformCredentials()
      onChange(false)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>
              <KeyRound className="mr-2 size-5 shrink-0 text-q-icon-secondary" />{" "}
              {configured ? "Manage API key" : "Connect API key"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              <p className="text-q-body-sm-regular text-q-text-secondary">
                Paste the API key copied from{" "}
                <a
                  href="https://open.higgsfield.ai/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-q-text-link underline"
                >
                  open.higgsfield.ai
                </a>
                . Paste it as-is. It is stored in an HTTP-only cookie in
                this browser and used by the server for API requests.
              </p>
              <Input
                autoFocus
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key"
                aria-label="Higgsfield API key"
                autoComplete="off"
                spellCheck={false}
                invalid={error != null}
              />
              {error ? (
                <p className="text-q-caption-sm-regular text-q-state-error-fg">
                  {error}
                </p>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter
            caption={
              configured ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void clear()}
                  className="text-q-caption-sm-medium text-q-text-secondary hover:text-q-text-primary disabled:opacity-50"
                >
                  Remove API key
                </button>
              ) : undefined
            }
          >
            <Button type="submit" disabled={busy || !apiKey.trim()}>
              {configured ? "Replace API key" : "Connect API key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
