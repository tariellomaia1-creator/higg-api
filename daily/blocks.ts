/** Blocks of text separated by a line with only `---`. Without one, every
    non-empty line is its own block. Shared by batch planning and the queue. */
export function parseBlocks(text: string): string[] {
  const hasSeparator = /^\s*---\s*$/m.test(text)
  const parts = hasSeparator ? text.split(/^\s*---\s*$/m) : text.split(/\r?\n/)
  return parts.map((part) => part.trim()).filter(Boolean)
}
