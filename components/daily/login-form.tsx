"use client"

import { useActionState } from "react"

import { login } from "@/daily/actions"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null)
  return (
    <form action={action} className="mt-5 flex flex-col gap-3">
      <label htmlFor="password" className="sr-only">
        პაროლი
      </label>
      <Input
        id="password"
        name="password"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        placeholder="პაროლი"
        autoFocus
        required
        invalid={Boolean(state?.error)}
      />
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "მოწმდება…" : "შესვლა"}
      </Button>
    </form>
  )
}
