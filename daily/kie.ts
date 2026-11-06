import "server-only"

/** kie.ai Market API: one endpoint creates a task for any model, one reads
    its state. The HTTP status is 200 even on failure, so every answer is
    checked by its `code` field. https://docs.kie.ai */

const BASE_URL = "https://api.kie.ai"

export class KieError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = "KieError"
    this.code = code
  }
}

export type KieTask =
  | { state: "pending" }
  | { state: "success"; url: string | null; credits: number }
  | { state: "fail"; reason: string; credits: number }

export function kieApiKey(): string | null {
  const key = process.env.KIE_API_KEY?.trim()
  return key ? key : null
}

/** Veo 3.1 Lite, start image as first frame, vertical, 8 s, 720p. Veo adds
    a native soundtrack (speech included) to every video by default. */
export function veoLiteTask(prompt: string, startImageUrl: string) {
  return {
    model: "veo-3-1",
    input: {
      prompt,
      model: "veo3_lite",
      image_urls: [startImageUrl],
      generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: 8,
    },
  }
}

/** GPT Image 2.6 Sunburst, square, 1K, JPEG (what Instagram accepts). */
export function gptSunburstTask(prompt: string) {
  return {
    model: "gpt-image-2-6/sunburst-text-to-image",
    input: {
      prompt,
      aspect_ratio: "1:1",
      resolution: "1K",
      output_format: "jpeg",
    },
  }
}

async function call(
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  })
  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  const data = asRecord(payload)
  const code = Number(data.code ?? response.status)
  if (!response.ok || code !== 200) {
    const message =
      typeof data.msg === "string" && data.msg
        ? data.msg
        : `kie.ai request failed (${code || response.status})`
    throw new KieError(code || response.status, message)
  }
  return asRecord(data.data)
}

export async function createKieTask(
  apiKey: string,
  task: { model: string; input: Record<string, unknown> }
): Promise<string> {
  const data = await call(apiKey, "POST", "/api/v1/jobs/createTask", task)
  const taskId = data.taskId
  if (typeof taskId !== "string" || !taskId)
    throw new KieError(502, "kie.ai did not return a task id.")
  return taskId
}

export async function getKieTask(
  apiKey: string,
  taskId: string
): Promise<KieTask> {
  const data = await call(
    apiKey,
    "GET",
    `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`
  )
  const state = data.state
  const credits = Number(data.creditsConsumed)
  const charged = Number.isFinite(credits) && credits > 0 ? credits : 0
  if (state === "success")
    return { state: "success", url: firstResultUrl(data), credits: charged }
  if (state === "fail") {
    const reason =
      typeof data.failMsg === "string" && data.failMsg
        ? data.failMsg
        : `Generation failed${data.failCode ? ` (${String(data.failCode)})` : ""}.`
    return { state: "fail", reason, credits: charged }
  }
  return { state: "pending" }
}

/** Uploads a file to kie.ai's own temporary storage (kept 24 hours, free)
    and returns a URL kie.ai's models can always fetch. Used for start images,
    because a private Vercel Blob URL is not reachable from kie.ai. */
export async function uploadToKie(
  apiKey: string,
  bytes: Buffer,
  contentType: string,
  fileName: string
): Promise<string> {
  const form = new FormData()
  form.append("file", new Blob([new Uint8Array(bytes)], { type: contentType }), fileName)
  form.append("uploadPath", "behero-daily/start")
  form.append("fileName", fileName)
  const response = await fetch(
    "https://kieai.redpandaai.co/api/file-stream-upload",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      cache: "no-store",
    }
  )
  const payload = asRecord(await response.json().catch(() => null))
  const code = Number(payload.code ?? response.status)
  if (!response.ok || code !== 200)
    throw new KieError(
      code || response.status,
      typeof payload.msg === "string" && payload.msg
        ? `Start image upload to kie.ai failed: ${payload.msg}`
        : `Start image upload to kie.ai failed (${code || response.status}).`
    )
  const url = asRecord(payload.data).downloadUrl
  if (typeof url !== "string" || !url)
    throw new KieError(502, "kie.ai upload returned no file URL.")
  return url
}

/** Remaining credits on the account that owns this key. */
export async function getKieBalance(apiKey: string): Promise<number> {
  const response = await fetch(`${BASE_URL}/api/v1/chat/credit`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  })
  const payload = asRecord(await response.json().catch(() => null))
  const code = Number(payload.code ?? response.status)
  if (!response.ok || code !== 200)
    throw new KieError(
      code || response.status,
      typeof payload.msg === "string" && payload.msg
        ? payload.msg
        : `kie.ai balance request failed (${code || response.status})`
    )
  const balance = Number(payload.data)
  if (!Number.isFinite(balance)) throw new KieError(502, "kie.ai returned no balance.")
  return balance
}

function firstResultUrl(data: Record<string, unknown>): string | null {
  let result: unknown = data.resultJson
  if (typeof result === "string") {
    try {
      result = JSON.parse(result)
    } catch {
      result = null
    }
  }
  const urls = asRecord(result).resultUrls
  const first = Array.isArray(urls) ? urls[0] : undefined
  return typeof first === "string" && first ? first : null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
