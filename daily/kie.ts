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
  | { state: "success"; url: string | null }
  | { state: "fail"; reason: string }

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
  if (state === "success") return { state: "success", url: firstResultUrl(data) }
  if (state === "fail") {
    const reason =
      typeof data.failMsg === "string" && data.failMsg
        ? data.failMsg
        : `Generation failed${data.failCode ? ` (${String(data.failCode)})` : ""}.`
    return { state: "fail", reason }
  }
  return { state: "pending" }
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
