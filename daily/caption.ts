/** Builds a post caption from a prompt: the Georgian lines the character
    says (or the poster shows), written in quotes, followed by the fixed
    footer from the settings (link, call to action, hashtags). Pure, so the
    planner and the server build the same text. */

const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿⴀ-⴯]/

/** „…“  "…"  “…”  «…»  ‘…’ */
const QUOTED = /„([^“”"]+)[“”"]|"([^"]+)"|“([^”]+)”|«([^»]+)»|‘([^’]+)’/g

export function extractGeorgianQuotes(prompt: string): string[] {
  const found: string[] = []
  for (const match of prompt.matchAll(QUOTED)) {
    const text = (match.slice(1).find((group) => group !== undefined) ?? "").trim()
    if (text && GEORGIAN.test(text) && !found.includes(text)) found.push(text)
  }
  return found
}

export function buildCaption(prompt: string, footer: string): string {
  const quotes = extractGeorgianQuotes(prompt)
  const body = quotes.map((quote) => `„${quote}“`).join("\n")
  return [body, footer.trim()].filter(Boolean).join("\n\n").slice(0, 2200)
}
