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

/** Georgian passages written without quotes: runs of Georgian words with the
    spaces, digits and punctuation between them. Used when nothing is quoted. */
const GEORGIAN_RUN =
  /(?:[0-9][0-9\s.,\-–₾%]*)?[\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F][\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F0-9\s,.!?…:;—–\-₾%()]*[\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F0-9!?….₾%)]/g
const GEORGIAN_LETTERS = /[\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F]/g

export function extractGeorgianRuns(prompt: string): string[] {
  const found: string[] = []
  for (const match of prompt.matchAll(GEORGIAN_RUN)) {
    const text = match[0].replace(/\s+/g, " ").trim()
    const letters = text.match(GEORGIAN_LETTERS)?.length ?? 0
    if (letters >= 3 && !found.includes(text)) found.push(text)
  }
  return found
}

export function buildCaption(prompt: string, footer: string): string {
  const quoted = extractGeorgianQuotes(prompt)
  const quotes = quoted.length ? quoted : extractGeorgianRuns(prompt)
  const body = quotes.map((quote) => `„${quote}“`).join("\n")
  return [body, footer.trim()].filter(Boolean).join("\n\n").slice(0, 2200)
}
