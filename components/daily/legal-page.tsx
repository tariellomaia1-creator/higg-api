/** Shared layout for the public legal pages (Terms, Privacy). */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-10 text-sm leading-relaxed sm:px-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">BeHero</p>
        <h1 className="font-heading text-2xl font-semibold text-balance">{title}</h1>
        <p className="text-xs text-muted-foreground">Last updated: {updated}</p>
      </header>
      <div className="flex flex-col gap-4 [&_h2]:font-heading [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </main>
  )
}
