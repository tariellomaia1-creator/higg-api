"use server"

import { cookies } from "next/headers"

import { getModel, parseSettings } from "./catalog"
import type { GenerationPlane } from "./catalog/types"
import {
  MissingCredentialsError,
  PLATFORM_KEY_COOKIE,
  PLATFORM_KEY_COOKIE_OPTIONS,
  decodeCredentials,
  encodeCredentials,
  parseCredentialInput,
} from "./credentials"
import { PlatformError, createPlatformClient } from "./platform"
import type { CostEstimate, StatusResult } from "./platform"
import { toPlatform } from "./to-platform"

export async function savePlatformCredentials(data: unknown) {
  const { apiKey } = parseCredentialInput(data)
  const jar = await cookies()
  jar.set(
    PLATFORM_KEY_COOKIE,
    encodeCredentials(apiKey),
    PLATFORM_KEY_COOKIE_OPTIONS
  )
}

export async function clearPlatformCredentials() {
  const jar = await cookies()
  jar.set(PLATFORM_KEY_COOKIE, "", {
    ...PLATFORM_KEY_COOKIE_OPTIONS,
    maxAge: 0,
  })
}

export async function hasPlatformCredentials() {
  return (await readStoredCredentials()) !== null
}

export async function submitGeneration(
  plane: GenerationPlane,
  idempotencyKey: unknown
) {
  if (
    typeof idempotencyKey !== "string" ||
    !/^[A-Za-z0-9-]{16,64}$/.test(idempotencyKey)
  )
    throw new Error("Invalid idempotency key")
  const model = getModel(plane.model)
  const parsed: GenerationPlane = {
    ...plane,
    settings: parseSettings(model, plane.settings),
  }
  const { path, body } = toPlatform(parsed)
  return createPlatformClient(await readCredentials()).submit(
    path,
    body,
    idempotencyKey
  )
}

/** What `submitGeneration` would cost for the same plane; queues nothing.
    Failures come back as data: production builds mask thrown action errors,
    and the calculator must show the reason on its own line. */
export async function estimateGeneration(
  plane: GenerationPlane
): Promise<{ estimate: CostEstimate } | { error: string }> {
  try {
    const model = getModel(plane.model)
    const parsed: GenerationPlane = {
      ...plane,
      settings: parseSettings(model, plane.settings),
    }
    const { path, body } = toPlatform(parsed)
    const client = createPlatformClient(await readCredentials())
    return { estimate: await client.estimate(path, body) }
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : String(caught) }
  }
}

/** Every request in flight, answered in one round trip. Next dispatches server
    actions one at a time per client, so a poll per run would queue ahead of the
    next submit — the fan-out belongs on this side of the call, where it is
    genuinely parallel. */
export async function getGenerationStatuses(
  data: unknown
): Promise<StatusResult[]> {
  const requestIds = parseRequestIds(data)
  const client = createPlatformClient(await readCredentials())
  return Promise.all(
    requestIds.map(async (requestId): Promise<StatusResult> => {
      try {
        return { requestId, status: await client.status(requestId) }
      } catch (caught) {
        // Network failures and 5xx are worth asking again; 401/404 are not.
        return {
          requestId,
          error: caught instanceof Error ? caught.message : String(caught),
          transient: !(caught instanceof PlatformError) || caught.status >= 500,
        }
      }
    })
  )
}

export async function cancelGeneration(data: unknown) {
  const [requestId] = parseRequestIds(data)
  await createPlatformClient(await readCredentials()).cancel(requestId!)
}

async function readStoredCredentials() {
  const jar = await cookies()
  return decodeCredentials(jar.get(PLATFORM_KEY_COOKIE)?.value)
}

async function readCredentials() {
  const stored = await readStoredCredentials()
  if (!stored) throw new MissingCredentialsError()
  const baseUrl = process.env.HF_API_BASE_URL
  if (!baseUrl) throw new Error("Missing HF_API_BASE_URL")
  return { ...stored, baseUrl }
}

function parseRequestIds(data: unknown): string[] {
  const payload = asObject(data, "Invalid status payload")
  const requestIds = payload.requestIds
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    throw new Error("Invalid request ids")
  }
  return requestIds.map((requestId) => {
    if (typeof requestId !== "string" || !requestId)
      throw new Error("Invalid request id")
    return requestId
  })
}

function asObject(data: unknown, message: string): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data))
    throw new Error(message)
  return data as Record<string, unknown>
}
