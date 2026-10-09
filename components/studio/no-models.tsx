const ADD =
  "pnpm dlx shadcn@latest add higgsfield-ai/app-templates/seedance-2.5"
const LIST = "pnpm dlx shadcn@latest list higgsfield-ai/app-templates"

/** Shown instead of the studio when generation/catalog/models/ is empty. */
export function NoModels() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div className="flex max-w-xl flex-col items-center gap-3">
        <h1 className="text-q-headline-md-semi-bold">No models installed</h1>
        <p className="text-sm text-muted-foreground">
          Add one and the dev server picks it up. Every model is one file in{" "}
          <code>generation/catalog/models/</code>.
        </p>
        <pre className="mt-2 w-full rounded-lg border bg-card px-4 py-2.5 text-left font-mono text-xs text-muted-foreground select-all">
          {ADD}
        </pre>
        <pre className="w-full rounded-lg border bg-card px-4 py-2.5 text-left font-mono text-xs text-muted-foreground select-all">
          {LIST}
        </pre>
      </div>
    </main>
  )
}
