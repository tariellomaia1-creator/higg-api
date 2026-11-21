import "server-only"

import type { QueueChannel } from "./db"
import { getSetting, setSetting } from "./db"
import type { MetaConfig } from "./meta"
import { metaConfig } from "./meta"

/** Posting channels. "fb" and "ig" are BeHero's Facebook Page and Instagram
    (META_PAGE_* variables). Other pages the owner administers are found
    with META_USER_ACCESS_TOKEN and switched on in the app:
    "fbp_<pageId>" posts to that Facebook Page, "igu_<igUserId>" to the
    Instagram account linked to a page. Page tokens stay on the server. */

export type ChannelInfo = {
  id: QueueChannel
  label: string
  platform: "facebook" | "instagram"
  /** Facebook Page the channel belongs to (an Instagram account's page). */
  pageId: string | null
  connected: boolean
  /** The behero.ge badge on videos: BeHero channels only. */
  badge: boolean
}

export type DiscoveredPage = {
  pageId: string
  name: string
  instagram: { id: string; username: string } | null
}

type PageWithToken = DiscoveredPage & { token: string }

const CHANNEL_PATTERN = /^(fb|ig|fbp_\d{1,30}|igu_\d{1,30})$/

export function asChannel(value: unknown): QueueChannel {
  return typeof value === "string" && CHANNEL_PATTERN.test(value) ? value : "fb"
}

export function isBeheroChannel(channel: QueueChannel): boolean {
  return channel === "fb" || channel === "ig"
}

function graphVersion(): string {
  return process.env.META_GRAPH_VERSION?.trim() || "v23.0"
}

let cache: { at: number; pages: PageWithToken[] } | null = null

/** Tokens that may be a user token: META_USER_ACCESS_TOKEN, and
    META_PAGE_ACCESS_TOKEN too, in case a user token was put there. */
function userTokenCandidates(): string[] {
  const list = [process.env.META_USER_ACCESS_TOKEN?.trim(), process.env.META_PAGE_ACCESS_TOKEN?.trim()]
  return [...new Set(list.filter((token): token is string => Boolean(token)))]
}

/** Pages a user token can manage, with their Instagram accounts and page
    tokens. Tries each candidate token (a page token cannot list pages).
    Cached for 10 minutes per server instance. */
async function pagesWithTokens(): Promise<PageWithToken[]> {
  const tokens = userTokenCandidates()
  if (tokens.length === 0) return []
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.pages
  let lastError: Error | null = null
  for (const token of tokens) {
    try {
      const pages = await listPages(token)
      cache = { at: Date.now(), pages }
      return pages
    } catch (caught) {
      lastError = caught instanceof Error ? caught : new Error(String(caught))
    }
  }
  throw lastError ?? new Error("Meta გვერდების სია ვერ წამოვიდა.")
}

async function listPages(token: string): Promise<PageWithToken[]> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/me/accounts`)
  url.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}")
  url.searchParams.set("limit", "100")
  url.searchParams.set("access_token", token)
  const response = await fetch(url, { cache: "no-store" })
  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{
      id?: unknown
      name?: unknown
      access_token?: unknown
      instagram_business_account?: { id?: unknown; username?: unknown }
    }>
    error?: { message?: unknown }
  } | null
  if (!response.ok || !payload || payload.error || !Array.isArray(payload.data)) {
    const reason = typeof payload?.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`
    throw new Error(`Meta გვერდების სია ვერ წამოვიდა: ${reason}`)
  }
  const pages = (payload.data ?? []).flatMap((page): PageWithToken[] => {
    if (typeof page.id !== "string" || typeof page.access_token !== "string") return []
    const ig = page.instagram_business_account
    return [
      {
        pageId: page.id,
        name: typeof page.name === "string" ? page.name : page.id,
        token: page.access_token,
        instagram:
          ig && typeof ig.id === "string"
            ? { id: ig.id, username: typeof ig.username === "string" ? ig.username : ig.id }
            : null,
      },
    ]
  })
  return pages
}

/** BeHero's Meta settings with a real page token: when a user token sits
    in the variables, BeHero's page token is taken from its page list, so
    either kind of token in META_PAGE_ACCESS_TOKEN works. */
export async function beheroMeta(): Promise<MetaConfig | null> {
  const base = metaConfig()
  if (!base) return null
  try {
    const page = (await pagesWithTokens()).find((entry) => entry.pageId === base.pageId)
    if (page) return { ...base, token: page.token }
  } catch {
    // Not a user token: use the page token as given.
  }
  return base
}

/** The other pages (not BeHero's), without tokens, for the page picker. */
export async function discoverPages(): Promise<{ pages: DiscoveredPage[]; error: string | null; configured: boolean }> {
  const explicit = Boolean(process.env.META_USER_ACCESS_TOKEN?.trim())
  if (userTokenCandidates().length === 0) return { pages: [], error: null, configured: false }
  try {
    const behero = metaConfig()?.pageId
    const all = await pagesWithTokens()
    const pages = all
      .filter((page) => page.pageId !== behero)
      .map(({ pageId, name, instagram }) => ({ pageId, name, instagram }))
    return { pages, error: null, configured: true }
  } catch (caught) {
    // Only a page token is set: no other pages, and nothing to report.
    if (!explicit) return { pages: [], error: null, configured: false }
    return { pages: [], error: caught instanceof Error ? caught.message : String(caught), configured: true }
  }
}

type StoredChannel = { id: QueueChannel; label: string; pageId: string }

async function storedExtras(): Promise<StoredChannel[]> {
  const raw = await getSetting("extra_channels")
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.flatMap((entry): StoredChannel[] => {
      const record = entry as Record<string, unknown>
      const id = typeof record.id === "string" && CHANNEL_PATTERN.test(record.id) ? record.id : null
      if (!id || isBeheroChannel(id)) return []
      return [
        {
          id,
          label: typeof record.label === "string" ? record.label : id,
          pageId: typeof record.pageId === "string" ? record.pageId : "",
        },
      ]
    })
  } catch {
    return []
  }
}

/** Switches the given extra channels on (all others off). Labels come
    from the live page list, so only real, manageable pages are kept. */
export async function saveExtraChannels(ids: unknown): Promise<void> {
  const wanted = new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [])
  const { pages, error } = await discoverPages()
  if (error) throw new Error(error)
  const chosen: StoredChannel[] = []
  for (const page of pages) {
    if (wanted.has(`fbp_${page.pageId}`))
      chosen.push({ id: `fbp_${page.pageId}`, label: `${page.name} · Facebook`, pageId: page.pageId })
    if (page.instagram && wanted.has(`igu_${page.instagram.id}`))
      chosen.push({
        id: `igu_${page.instagram.id}`,
        label: `${page.name} · Instagram (@${page.instagram.username})`,
        pageId: page.pageId,
      })
  }
  await setSetting("extra_channels", JSON.stringify(chosen))
}

/** Every channel shown and processed: BeHero's two, then the extras. */
export async function listChannels(): Promise<ChannelInfo[]> {
  const meta = metaConfig()
  const base: ChannelInfo[] = [
    {
      id: "fb",
      label: "BeHero · Facebook",
      platform: "facebook",
      pageId: meta?.pageId ?? null,
      connected: Boolean(meta),
      badge: true,
    },
    {
      id: "ig",
      label: "BeHero · Instagram",
      platform: "instagram",
      pageId: meta?.pageId ?? null,
      connected: Boolean(meta?.igUserId),
      badge: true,
    },
  ]
  const extras = await storedExtras()
  let known: PageWithToken[] = []
  try {
    known = extras.length ? await pagesWithTokens() : []
  } catch {
    known = []
  }
  return [
    ...base,
    ...extras.map((extra): ChannelInfo => {
      const page = known.find((entry) => entry.pageId === extra.pageId)
      const instagram = extra.id.startsWith("igu_")
      return {
        id: extra.id,
        label: extra.label,
        platform: instagram ? "instagram" : "facebook",
        pageId: extra.pageId,
        connected: Boolean(page && (!instagram || page.instagram?.id === extra.id.slice(4))),
        badge: false,
      }
    }),
  ]
}

/** Where a channel posts: the Graph credentials and which side. */
export async function channelTarget(
  channel: QueueChannel
): Promise<{ meta: MetaConfig; facebook: boolean; instagram: boolean } | null> {
  if (isBeheroChannel(channel)) {
    const meta = await beheroMeta()
    if (!meta || (channel === "ig" && !meta.igUserId)) return null
    return { meta, facebook: channel === "fb", instagram: channel === "ig" }
  }
  const pages = await pagesWithTokens()
  if (channel.startsWith("fbp_")) {
    const page = pages.find((entry) => entry.pageId === channel.slice(4))
    return page
      ? { meta: { pageId: page.pageId, token: page.token, igUserId: null, version: graphVersion() }, facebook: true, instagram: false }
      : null
  }
  const igId = channel.slice(4)
  const page = pages.find((entry) => entry.instagram?.id === igId)
  return page
    ? { meta: { pageId: page.pageId, token: page.token, igUserId: igId, version: graphVersion() }, facebook: false, instagram: true }
    : null
}
