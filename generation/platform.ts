import { toAuthorizationHeader } from "./credentials"
import { parseUploadTicket, requireUploadContentType } from "./upload-contract"
import type { UploadTicket } from "./upload-contract"

const UPLOAD_PATH = "/files/generate-upload-url"
const MODEL_ID = /^[a-z0-9][a-z0-9._/-]*$/i
const SUBMIT_ATTEMPTS = 3

export class PlatformError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(messageFromBody(status, body))
    this.name = "PlatformError"
    this.status = status
    this.body = body
  }
}

export type QueuedGeneration = {
  status: string
  requestId: string
  statusUrl: string
  cancelUrl: string
}

export type GenerationStatus = {
  status: string
  requestId: string
  images?: Array<{ url: string }>
  video?: { url: string }
  error?: unknown
}

/** `credits` is null and `approximate` set when the platform only describes
    its rate (per-second video pricing) instead of quoting this request. */
export type CostEstimate = {
  credits: number | null
  usd: number
  approximate?: boolean
  note?: string
}

/** One request's answer inside a batched status poll. A request that errors
    carries its reason alone, so it cannot lose the answers standing beside it. */
export type StatusResult =
  | { requestId: string; status: GenerationStatus }
  | { requestId: string; error: string; transient?: boolean }

export type PlatformClientOptions = {
  apiKey: string
  baseUrl: string
  fetch?: typeof fetch
}

export function isModelId(model: string): boolean {
  return MODEL_ID.test(model) && !model.includes("..")
}

export function createPlatformClient(options: PlatformClientOptions) {
  // Env values pasted into a dashboard or CLI can carry a stray newline,
  // which fetch rejects as an unparseable URL.
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, "")
  const fetchImpl = options.fetch ?? fetch
  const auth = toAuthorizationHeader(options.apiKey)

  async function send(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string
  ) {
    const url = `${baseUrl}${path}`
    console.info("[platform] request", { method, url, body: body ?? null })
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: auth,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    const payload = await readJson(response)
    // Signed upload URLs are credentials; do not write them to logs.
    console.info("[platform] response", {
      method,
      url,
      status: response.status,
      ...(path === UPLOAD_PATH ? {} : { body: payload }),
    })
    if (!response.ok) throw new PlatformError(response.status, payload)
    return payload
  }

  return {
    async createUpload(contentType: unknown): Promise<UploadTicket> {
      const type = requireUploadContentType(contentType)
      return parseUploadTicket(
        await send("POST", UPLOAD_PATH, { content_type: type }),
        type
      )
    },
    /** Every attempt carries the same idempotency key, so resending after a
        network failure or 5xx cannot start a second generation. */
    async submit(
      model: string,
      input: Record<string, unknown>,
      idempotencyKey: string
    ): Promise<QueuedGeneration> {
      if (!isModelId(model))
        throw new PlatformError(400, { detail: "Invalid model" })
      for (let attempt = 1; ; attempt++) {
        try {
          return mapQueued(
            await send("POST", `/${model}`, input, idempotencyKey)
          )
        } catch (caught) {
          const transient =
            !(caught instanceof PlatformError) || caught.status >= 500
          if (!transient || attempt >= SUBMIT_ATTEMPTS) throw caught
          await sleep(1000 * 2 ** (attempt - 1))
        }
      }
    },
    /** Price of a submission with these exact parameters, for this account.
        Nothing is queued or charged. */
    async estimate(
      model: string,
      input: Record<string, unknown>
    ): Promise<CostEstimate> {
      if (!isModelId(model))
        throw new PlatformError(400, { detail: "Invalid model" })
      const data = asRecord(await send("POST", `/estimate/${model}`, input))
      const credits = Number(data.credits)
      const usd = Number(data.usd)
      if (Number.isFinite(credits) && Number.isFinite(usd))
        return { credits, usd }
      // Token-billed models (Seedance) answer with prose instead of numbers.
      const note = stringField(data, "pricing_description")
      if (data.type === "description" && note) {
        const perSecond = perSecondRate(note, input.resolution)
        const seconds = Number(input.duration)
        if (perSecond !== null && Number.isFinite(seconds))
          return {
            credits: null,
            usd: perSecond * seconds,
            approximate: true,
            note,
          }
        throw new PlatformError(502, { detail: note })
      }
      throw new PlatformError(502, {
        detail: "Platform estimate missing credits or usd",
      })
    },
    async status(requestId: string): Promise<GenerationStatus> {
      if (!requestId)
        throw new PlatformError(400, { detail: "Missing request id" })
      return mapStatus(
        await send("GET", `/requests/${encodeURIComponent(requestId)}/status`)
      )
    },
    /** Queued requests only; the platform answers 202 and the status turns "canceled". */
    async cancel(requestId: string): Promise<void> {
      if (!requestId)
        throw new PlatformError(400, { detail: "Missing request id" })
      await send(
        "POST",
        `/requests/${encodeURIComponent(requestId)}/cancel`,
        {}
      )
    },
  }
}

function mapQueued(payload: unknown): QueuedGeneration {
  const data = asRecord(payload)
  const requestId = stringField(data, "request_id")
  if (!requestId)
    throw new PlatformError(502, {
      detail: "Platform response missing request_id",
    })
  return {
    status: stringField(data, "status") ?? "queued",
    requestId,
    statusUrl: stringField(data, "status_url") ?? "",
    cancelUrl: stringField(data, "cancel_url") ?? "",
  }
}

function mapStatus(payload: unknown): GenerationStatus {
  const data = asRecord(payload)
  const requestId = stringField(data, "request_id") ?? ""
  const images = Array.isArray(data.images)
    ? data.images.flatMap((item) => {
        const url = asRecord(item).url
        return typeof url === "string" ? [{ url }] : []
      })
    : undefined
  const videoUrl = asRecord(data.video).url

  return {
    status: stringField(data, "status") ?? "unknown",
    requestId,
    ...(images?.length ? { images } : {}),
    ...(typeof videoUrl === "string" ? { video: { url: videoUrl } } : {}),
    ...(data.error !== undefined ? { error: data.error } : {}),
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringField(
  value: Record<string, unknown>,
  key: string
): string | undefined {
  const field = value[key]
  return typeof field === "string" ? field : undefined
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/** "$0.2056 per second of generated video at 480p, $0.4622 at 720p, …" →
    the dollar rate quoted for the requested resolution. */
function perSecondRate(note: string, resolution: unknown): number | null {
  if (typeof resolution !== "string" || !/^\w+$/.test(resolution)) {
    // No resolution in the request: only trust a single quoted rate.
    const rates = [...note.matchAll(/\$([\d.]+)\s+per second/g)]
    const rate = rates.length === 1 ? Number(rates[0]![1]) : NaN
    return Number.isFinite(rate) ? rate : null
  }
  const match = new RegExp(
    `\\$([\\d.]+)(?:\\s+per second of generated video)?\\s+at\\s+${resolution}\\b`
  ).exec(note)
  const rate = match ? Number(match[1]) : NaN
  return Number.isFinite(rate) ? rate : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function messageFromBody(status: number, body: unknown): string {
  if (status === 401)
    return "Higgsfield rejected this API key. Use Replace API key and paste the complete key from open.higgsfield.ai/api-keys (key ID and secret together)."
  const detail = asRecord(body).detail
  if (typeof detail === "string" && detail) return detail
  return `Platform request failed (${status})`
}
