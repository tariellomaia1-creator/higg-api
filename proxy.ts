import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { SESSION_COOKIE, isValidSession } from "./daily/auth"
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_OPTIONS,
  resolveDeviceId,
} from "./generation/device"

/** Pages anyone may open without the site password: the legal pages TikTok
    links to, and TikTok's URL-prefix verification files under /tiktok/. */
function isPublicPath(pathname: string): boolean {
  return pathname === "/terms" || pathname === "/privacy" || pathname.startsWith("/tiktok/")
}

export async function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next()
  const isLogin = request.nextUrl.pathname === "/login"
  const signedIn = await isValidSession(
    request.cookies.get(SESSION_COOKIE)?.value
  )
  if (!signedIn && !isLogin)
    return NextResponse.redirect(new URL("/login", request.url))
  if (signedIn && isLogin)
    return NextResponse.redirect(new URL("/", request.url))

  const { deviceId, minted } = resolveDeviceId(
    request.cookies.get(DEVICE_COOKIE)?.value
  )
  if (!minted) return NextResponse.next()
  const response = NextResponse.next()
  response.cookies.set(DEVICE_COOKIE, deviceId, DEVICE_COOKIE_OPTIONS)
  return response
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
