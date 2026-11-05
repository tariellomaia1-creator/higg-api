import type { Metadata } from "next"

import { LoginForm } from "@/components/daily/login-form"

export const metadata: Metadata = { title: "შესვლა · BeHero Daily" }

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <h1 className="font-heading text-xl font-semibold">BeHero Daily</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          შეიყვანე პაროლი, რომ გახსნა დღის გეგმა.
        </p>
        <LoginForm />
      </div>
    </main>
  )
}
