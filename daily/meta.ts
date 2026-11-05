import "server-only"

/** Facebook Page + linked Instagram Business account publishing via the
    Graph API. The page access token never leaves the server. */

export type MetaConfig = {
  pageId: string
  igUserId: string | null
  token: string
  version: string
}

export function metaConfig(): MetaConfig | null {
  const pageId = process.env.META_PAGE_ID?.trim()
  const token = process.env.META_PAGE_ACCESS_TOKEN?.trim()
  if (!pageId || !token) return null
  return {
    pageId,
    token,
    igUserId: process.env.META_IG_USER_ID?.trim() || null,
    version: process.env.META_GRAPH_VERSION?.trim() || "v23.0",
  }
}

export class MetaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MetaError"
  }
}

async function graph(
  config: MetaConfig,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const url = new URL(`https://graph.facebook.com/${config.version}/${path}`)
  const body = new URLSearchParams({ ...params, access_token: config.token })
  const response =
    method === "GET"
      ? await fetch(`${url}?${body}`, { cache: "no-store" })
      : await fetch(url, { method, body, cache: "no-store" })
  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  const data =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  if (!response.ok || data.error) {
    const error = data.error as { message?: unknown } | undefined
    const message =
      typeof error?.message === "string"
        ? error.message
        : `Meta request failed (${response.status})`
    throw new MetaError(message)
  }
  return data
}

function idOf(data: Record<string, unknown>): string {
  const id = data.post_id ?? data.id
  if (typeof id !== "string" && typeof id !== "number")
    throw new MetaError("Meta response missing id")
  return String(id)
}

export async function publishFacebook(
  config: MetaConfig,
  kind: "video" | "poster",
  mediaUrl: string,
  caption: string
): Promise<string> {
  if (kind === "video")
    return idOf(
      await graph(config, "POST", `${config.pageId}/videos`, {
        file_url: mediaUrl,
        description: caption,
      })
    )
  return idOf(
    await graph(config, "POST", `${config.pageId}/photos`, {
      url: mediaUrl,
      caption,
    })
  )
}

export async function createInstagramContainer(
  config: MetaConfig,
  kind: "video" | "poster",
  mediaUrl: string,
  caption: string
): Promise<string> {
  if (!config.igUserId) throw new MetaError("META_IG_USER_ID is not set")
  const params: Record<string, string> =
    kind === "video"
      ? {
          media_type: "REELS",
          video_url: mediaUrl,
          caption,
          share_to_feed: "true",
        }
      : { image_url: mediaUrl, caption }
  return idOf(await graph(config, "POST", `${config.igUserId}/media`, params))
}

/** FINISHED, IN_PROGRESS, ERROR, EXPIRED or PUBLISHED. */
export async function instagramContainerStatus(
  config: MetaConfig,
  containerId: string
): Promise<string> {
  const data = await graph(config, "GET", containerId, {
    fields: "status_code",
  })
  return typeof data.status_code === "string" ? data.status_code : "UNKNOWN"
}

export async function publishInstagramContainer(
  config: MetaConfig,
  containerId: string
): Promise<string> {
  if (!config.igUserId) throw new MetaError("META_IG_USER_ID is not set")
  return idOf(
    await graph(config, "POST", `${config.igUserId}/media_publish`, {
      creation_id: containerId,
    })
  )
}
