import "server-only"

import { cookies } from "next/headers"

import { SESSION_COOKIE, isValidSession } from "./auth"

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in again: the session has expired.")
    this.name = "UnauthorizedError"
  }
}

export async function requireSession(): Promise<void> {
  const jar = await cookies()
  if (!(await isValidSession(jar.get(SESSION_COOKIE)?.value)))
    throw new UnauthorizedError()
}
