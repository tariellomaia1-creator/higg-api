export const DEVICE_COOKIE = "hf_device"

export const DEVICE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
}

const DEVICE_ID_RE = /^[A-Za-z0-9_-]{16,64}$/

export function mintDeviceId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export function parseDeviceId(raw: string | undefined): string | null {
  return raw && DEVICE_ID_RE.test(raw) ? raw : null
}

export function resolveDeviceId(raw: string | undefined): {
  deviceId: string
  minted: boolean
} {
  const existing = parseDeviceId(raw)
  if (existing) return { deviceId: existing, minted: false }
  return { deviceId: mintDeviceId(), minted: true }
}
