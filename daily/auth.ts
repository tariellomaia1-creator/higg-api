/** Site password gate. The cookie holds an HMAC of a fixed label keyed by the
    password, so changing SITE_PASSWORD signs every browser out. Uses Web Crypto
    only, so the proxy can import it. */

export const SESSION_COOKIE = "daily_session"
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export function sitePassword(): string | null {
  const value = process.env.SITE_PASSWORD?.trim()
  return value ? value : null
}

export async function sessionToken(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode("behero-daily-session-v1")
  )
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++)
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

export async function isValidSession(
  cookieValue: string | undefined
): Promise<boolean> {
  const password = sitePassword()
  if (!password || !cookieValue) return false
  return safeEqual(cookieValue, await sessionToken(password))
}
