export const PLATFORM_KEY_COOKIE = "api_key"

export const PLATFORM_KEY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

export class MissingCredentialsError extends Error {
  constructor() {
    super("Connect your Higgsfield API key")
    this.name = "MissingCredentialsError"
  }
}

export function encodeCredentials(apiKey: string): string {
  return JSON.stringify({ apiKey })
}

export function decodeCredentials(
  raw: string | undefined
): { apiKey: string } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return null
    const apiKey = (parsed as { apiKey?: unknown }).apiKey
    if (typeof apiKey !== "string" || !apiKey.trim()) return null
    return { apiKey: requireApiKey(apiKey) }
  } catch {
    return null
  }
}

export function parseCredentialInput(data: unknown): { apiKey: string } {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Enter an API key")
  }
  const record = data as { apiKey?: unknown; api_key?: unknown }
  const apiKey = record.apiKey ?? record.api_key
  if (typeof apiKey !== "string" || !apiKey.trim())
    throw new Error("Enter an API key")
  return { apiKey: requireApiKey(apiKey) }
}

export function toAuthorizationHeader(apiKey: string): string {
  return `Key ${requireApiKey(apiKey)}`
}

function requireApiKey(apiKey: string): string {
  const key = apiKey.trim()
  if (!key) throw new Error("Enter an API key")
  if (/[^\x21-\x7E]/.test(key))
    throw new Error("Paste the API key exactly as copied from open.higgsfield.ai")
  return key
}
