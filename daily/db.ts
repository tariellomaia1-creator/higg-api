import "server-only"

import { neon } from "@neondatabase/serverless"

import type { ItemKind } from "./config"

export type GenStatus = "pending" | "generating" | "ready" | "failed"
export type PublishStatus =
  | "waiting"
  | "publishing"
  | "published"
  | "partial"
  | "failed"

export type DailyItem = {
  id: string
  day: string
  kind: ItemKind
  slot: number
  prompt: string
  caption: string
  startImageUrl: string | null
  startImageBytes: number
  status: GenStatus
  requestId: string | null
  attempts: number
  error: string | null
  resultUrl: string | null
  resultBytes: number
  publishStatus: PublishStatus
  fbPostId: string | null
  igContainerId: string | null
  igMediaId: string | null
  publishError: string | null
  publishedAt: string | null
  /** kie.ai credits charged for this slot so far (all attempts). */
  creditsUsed: number
  /** When the current attempt was sent to kie.ai, and when it finished. */
  submittedAt: string | null
  completedAt: string | null
}

type Sql = ReturnType<typeof neon>

let client: Sql | null = null
let schemaReady: Promise<void> | null = null

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "The database is not connected. In Vercel, open Storage, create a Neon Postgres database and connect it to this project."
    )
    this.name = "StorageNotConfiguredError"
  }
}

async function db(): Promise<Sql> {
  if (!client) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
    if (!url) throw new StorageNotConfiguredError()
    client = neon(url)
  }
  const sql = client
  schemaReady ??= createSchema(sql).catch((error: unknown) => {
    schemaReady = null
    throw error
  })
  await schemaReady
  return sql
}

async function createSchema(sql: Sql): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS daily_settings (key text PRIMARY KEY, value text NOT NULL)`
  await sql`
    CREATE TABLE IF NOT EXISTS post_queue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      position double precision NOT NULL,
      kind text NOT NULL CHECK (kind IN ('video', 'image')),
      file_name text NOT NULL DEFAULT '',
      media_url text,
      media_type text NOT NULL DEFAULT '',
      bytes bigint NOT NULL DEFAULT 0,
      caption text NOT NULL DEFAULT '',
      to_facebook boolean NOT NULL DEFAULT true,
      to_instagram boolean NOT NULL DEFAULT true,
      scheduled_at timestamptz,
      status text NOT NULL DEFAULT 'queued',
      fb_post_id text,
      ig_container_id text,
      ig_media_id text,
      error text,
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS daily_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      day date NOT NULL,
      kind text NOT NULL CHECK (kind IN ('video', 'poster')),
      slot integer NOT NULL,
      prompt text NOT NULL DEFAULT '',
      caption text NOT NULL DEFAULT '',
      start_image_url text,
      start_image_bytes bigint NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'pending',
      request_id text,
      attempts integer NOT NULL DEFAULT 0,
      error text,
      result_url text,
      result_bytes bigint NOT NULL DEFAULT 0,
      publish_status text NOT NULL DEFAULT 'waiting',
      fb_post_id text,
      ig_container_id text,
      ig_media_id text,
      publish_error text,
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (day, kind, slot)
    )`
  await sql`ALTER TABLE daily_items ADD COLUMN IF NOT EXISTS credits_used numeric NOT NULL DEFAULT 0`
  await sql`ALTER TABLE daily_items ADD COLUMN IF NOT EXISTS submitted_at timestamptz`
  await sql`ALTER TABLE daily_items ADD COLUMN IF NOT EXISTS completed_at timestamptz`
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function dayString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function toItem(row: Record<string, unknown>): DailyItem {
  return {
    id: String(row.id),
    day: dayString(row.day),
    kind: row.kind === "poster" ? "poster" : "video",
    slot: num(row.slot),
    prompt: str(row.prompt) ?? "",
    caption: str(row.caption) ?? "",
    startImageUrl: str(row.start_image_url),
    startImageBytes: num(row.start_image_bytes),
    status: (str(row.status) ?? "pending") as GenStatus,
    requestId: str(row.request_id),
    attempts: num(row.attempts),
    error: str(row.error),
    resultUrl: str(row.result_url),
    resultBytes: num(row.result_bytes),
    publishStatus: (str(row.publish_status) ?? "waiting") as PublishStatus,
    fbPostId: str(row.fb_post_id),
    igContainerId: str(row.ig_container_id),
    igMediaId: str(row.ig_media_id),
    publishError: str(row.publish_error),
    publishedAt:
      row.published_at instanceof Date
        ? row.published_at.toISOString()
        : str(row.published_at),
    creditsUsed: num(row.credits_used),
    submittedAt: isoOrNull(row.submitted_at),
    completedAt: isoOrNull(row.completed_at),
  }
}

function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  return typeof value === "string" ? value : null
}

function rows(result: unknown): DailyItem[] {
  return Array.isArray(result)
    ? result.map((row) => toItem(row as Record<string, unknown>))
    : []
}

export async function listDay(day: string): Promise<DailyItem[]> {
  const sql = await db()
  return rows(
    await sql`SELECT * FROM daily_items WHERE day = ${day} ORDER BY kind, slot`
  )
}

/** Slots planned between two days (inclusive), for batch scheduling. */
export async function listRange(from: string, to: string): Promise<DailyItem[]> {
  const sql = await db()
  return rows(
    await sql`SELECT * FROM daily_items WHERE day >= ${from} AND day <= ${to} ORDER BY day, kind, slot`
  )
}

export async function getItem(id: string): Promise<DailyItem | null> {
  const sql = await db()
  return rows(await sql`SELECT * FROM daily_items WHERE id = ${id}`)[0] ?? null
}

/** Saves the plan fields. Editing a slot that already generated resets it,
    so the new prompt or image is what gets generated and published. */
export async function upsertPlan(input: {
  day: string
  kind: ItemKind
  slot: number
  prompt: string
  caption: string
  startImageUrl: string | null
  startImageBytes: number
}): Promise<{ item: DailyItem; replacedUrls: string[] }> {
  const sql = await db()
  const previous = rows(
    await sql`SELECT * FROM daily_items WHERE day = ${input.day} AND kind = ${input.kind} AND slot = ${input.slot}`
  )[0]
  const contentChanged =
    !previous ||
    previous.prompt !== input.prompt ||
    previous.startImageUrl !== input.startImageUrl
  const reset = Boolean(previous && contentChanged && previous.status !== "pending")
  const replacedUrls: string[] = []
  if (previous?.startImageUrl && previous.startImageUrl !== input.startImageUrl)
    replacedUrls.push(previous.startImageUrl)
  if (reset && previous?.resultUrl) replacedUrls.push(previous.resultUrl)

  const saved = rows(await sql`
    INSERT INTO daily_items (day, kind, slot, prompt, caption, start_image_url, start_image_bytes)
    VALUES (${input.day}, ${input.kind}, ${input.slot}, ${input.prompt}, ${input.caption}, ${input.startImageUrl}, ${input.startImageBytes})
    ON CONFLICT (day, kind, slot) DO UPDATE SET
      prompt = EXCLUDED.prompt,
      caption = EXCLUDED.caption,
      start_image_url = EXCLUDED.start_image_url,
      start_image_bytes = EXCLUDED.start_image_bytes,
      status = CASE WHEN ${reset} THEN 'pending' ELSE daily_items.status END,
      request_id = CASE WHEN ${reset} THEN NULL ELSE daily_items.request_id END,
      attempts = CASE WHEN ${reset} THEN 0 ELSE daily_items.attempts END,
      error = CASE WHEN ${reset} THEN NULL ELSE daily_items.error END,
      result_url = CASE WHEN ${reset} THEN NULL ELSE daily_items.result_url END,
      result_bytes = CASE WHEN ${reset} THEN 0 ELSE daily_items.result_bytes END,
      updated_at = now()
    RETURNING *`)[0]
  if (!saved) throw new Error("Could not save the plan.")
  return { item: saved, replacedUrls }
}

export async function clearSlot(id: string): Promise<DailyItem | null> {
  const sql = await db()
  return rows(await sql`DELETE FROM daily_items WHERE id = ${id} RETURNING *`)[0] ?? null
}

export async function deleteDayItems(day: string): Promise<DailyItem[]> {
  const sql = await db()
  return rows(await sql`DELETE FROM daily_items WHERE day = ${day} RETURNING *`)
}

/** Planned slots for days up to `day` that are due to generate. */
export async function listGeneratable(day: string): Promise<DailyItem[]> {
  const sql = await db()
  return rows(await sql`
    SELECT * FROM daily_items
    WHERE day <= ${day} AND day >= ${day}::date - 1
      AND status = 'pending' AND prompt <> ''
      AND (kind = 'poster' OR start_image_url IS NOT NULL)
    ORDER BY day, kind DESC, slot`)
}

export async function listGenerating(): Promise<DailyItem[]> {
  const sql = await db()
  return rows(
    await sql`SELECT * FROM daily_items WHERE status = 'generating' AND request_id IS NOT NULL`
  )
}

export async function listPublishable(day: string): Promise<DailyItem[]> {
  const sql = await db()
  return rows(await sql`
    SELECT * FROM daily_items
    WHERE day = ${day} AND status = 'ready'
      AND publish_status IN ('waiting', 'publishing')
    ORDER BY slot, kind DESC`)
}

/** Posts started on Meta that are still being processed, any day. */
export async function listPublishing(): Promise<DailyItem[]> {
  const sql = await db()
  return rows(await sql`SELECT * FROM daily_items WHERE status = 'ready' AND publish_status = 'publishing'`)
}

export async function markSubmitted(
  id: string,
  requestId: string
): Promise<void> {
  const sql = await db()
  await sql`UPDATE daily_items SET status = 'generating', request_id = ${requestId},
    attempts = attempts + 1, error = NULL, submitted_at = now(), completed_at = NULL,
    updated_at = now() WHERE id = ${id}`
}

/** A failed attempt: retried on the next tick while attempts remain. */
export async function markAttemptFailed(
  id: string,
  error: string,
  final: boolean
): Promise<void> {
  const sql = await db()
  await sql`UPDATE daily_items SET status = ${final ? "failed" : "pending"},
    request_id = NULL, error = ${error}, updated_at = now() WHERE id = ${id}`
}

/** Submission never reached the platform: counts as an attempt. */
export async function markSubmitFailed(
  id: string,
  error: string,
  final: boolean
): Promise<void> {
  const sql = await db()
  await sql`UPDATE daily_items SET status = ${final ? "failed" : "pending"},
    attempts = attempts + 1, error = ${error}, updated_at = now() WHERE id = ${id}`
}

/** Account-level refusal (bad key): note it on the slot, keep the attempt. */
export async function markKeyRejected(id: string, error: string): Promise<void> {
  const sql = await db()
  await sql`UPDATE daily_items SET error = ${error}, updated_at = now()
    WHERE id = ${id} AND status = 'pending'`
}

/** Adds kie.ai credits charged for one finished or failed task. */
export async function addCreditsUsed(id: string, credits: number): Promise<void> {
  if (!Number.isFinite(credits) || credits <= 0) return
  const sql = await db()
  await sql`UPDATE daily_items SET credits_used = credits_used + ${credits}, updated_at = now() WHERE id = ${id}`
}

/** Records why a slot is stuck without changing its state or attempts. */
export async function noteError(id: string, error: string): Promise<void> {
  const sql = await db()
  await sql`UPDATE daily_items SET error = ${error}, updated_at = now() WHERE id = ${id}`
}

/** Marks a running slot ready. Returns false when another pass (the cron
    or an open planner) already finished it, so a duplicate copy can be removed. */
export async function markReady(
  id: string,
  resultUrl: string,
  resultBytes: number
): Promise<boolean> {
  const sql = await db()
  const updated = await sql`UPDATE daily_items SET status = 'ready', result_url = ${resultUrl},
    result_bytes = ${resultBytes}, error = NULL, completed_at = now(), updated_at = now()
    WHERE id = ${id} AND status = 'generating' RETURNING id`
  return Array.isArray(updated) && updated.length > 0
}

export async function resetForRetry(id: string): Promise<void> {
  const sql = await db()
  await sql`UPDATE daily_items SET status = 'pending', attempts = 0, error = NULL,
    request_id = NULL, updated_at = now() WHERE id = ${id} AND status = 'failed'`
}

export async function updatePublish(
  id: string,
  fields: {
    publishStatus: PublishStatus
    fbPostId?: string | null
    igContainerId?: string | null
    igMediaId?: string | null
    publishError?: string | null
    published?: boolean
  }
): Promise<void> {
  const sql = await db()
  const current = await getItem(id)
  if (!current) return
  await sql`UPDATE daily_items SET
    publish_status = ${fields.publishStatus},
    fb_post_id = ${fields.fbPostId === undefined ? current.fbPostId : fields.fbPostId},
    ig_container_id = ${fields.igContainerId === undefined ? current.igContainerId : fields.igContainerId},
    ig_media_id = ${fields.igMediaId === undefined ? current.igMediaId : fields.igMediaId},
    publish_error = ${fields.publishError === undefined ? current.publishError : fields.publishError},
    published_at = ${fields.published ? new Date().toISOString() : current.publishedAt},
    updated_at = now()
    WHERE id = ${id}`
}

export async function resetPublish(id: string): Promise<void> {
  const sql = await db()
  await sql`UPDATE daily_items SET publish_status = 'waiting', publish_error = NULL,
    ig_container_id = CASE WHEN ig_media_id IS NULL THEN NULL ELSE ig_container_id END,
    updated_at = now() WHERE id = ${id} AND publish_status IN ('failed', 'partial')`
}

/** Bytes this app keeps in Blob storage: start images and results. */
export async function storageUsedBytes(): Promise<number> {
  const sql = await db()
  const result = await sql`SELECT
    (SELECT COALESCE(SUM(start_image_bytes + result_bytes), 0) FROM daily_items) +
    (SELECT COALESCE(SUM(bytes), 0) FROM post_queue) AS used`
  const row = Array.isArray(result) ? (result[0] as Record<string, unknown>) : undefined
  return num(row?.used)
}

export async function listDaysWithContent(): Promise<
  Array<{ day: string; bytes: number; count: number }>
> {
  const sql = await db()
  const result = await sql`
    SELECT day, COUNT(*) AS count, SUM(start_image_bytes + result_bytes) AS bytes
    FROM daily_items GROUP BY day ORDER BY day DESC LIMIT 120`
  return Array.isArray(result)
    ? result.map((raw) => {
        const row = raw as Record<string, unknown>
        return { day: dayString(row.day), bytes: num(row.bytes), count: num(row.count) }
      })
    : []
}

/** Finished results across all days, newest first, for the gallery. */
export async function listFinished(limit = 300): Promise<DailyItem[]> {
  const sql = await db()
  return rows(await sql`
    SELECT * FROM daily_items WHERE status = 'ready' AND result_url IS NOT NULL
    ORDER BY day DESC, COALESCE(completed_at, updated_at) DESC LIMIT ${limit}`)
}

export async function getSetting(key: string): Promise<string | null> {
  const sql = await db()
  const result = await sql`SELECT value FROM daily_settings WHERE key = ${key}`
  const row = Array.isArray(result) ? (result[0] as Record<string, unknown> | undefined) : undefined
  return typeof row?.value === "string" ? row.value : null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const sql = await db()
  await sql`INSERT INTO daily_settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
}

/** Slots not yet posted whose caption is still empty. */
export async function listWithoutCaption(): Promise<DailyItem[]> {
  const sql = await db()
  return rows(await sql`SELECT * FROM daily_items WHERE caption = '' AND publish_status <> 'published'`)
}

/** Sets a caption only if it is still empty, so a typed one is never lost. */
export async function fillCaption(id: string, caption: string): Promise<boolean> {
  const sql = await db()
  const updated = await sql`UPDATE daily_items SET caption = ${caption}, updated_at = now()
    WHERE id = ${id} AND caption = '' RETURNING id`
  return Array.isArray(updated) && updated.length > 0
}

/** Every slot not yet posted, for caption updates. */
export async function listUnposted(): Promise<DailyItem[]> {
  const sql = await db()
  return rows(await sql`SELECT * FROM daily_items WHERE publish_status <> 'published'`)
}

export async function updateCaption(id: string, caption: string): Promise<void> {
  const sql = await db()
  await sql`UPDATE daily_items SET caption = ${caption}, updated_at = now() WHERE id = ${id}`
}

// ---------------------------------------------------------------- post queue

export type QueueStatus = "queued" | "publishing" | "published" | "partial" | "failed"

export type QueueItem = {
  id: string
  position: number
  kind: "video" | "image"
  fileName: string
  mediaUrl: string | null
  mediaType: string
  bytes: number
  caption: string
  toFacebook: boolean
  toInstagram: boolean
  scheduledAt: string | null
  status: QueueStatus
  fbPostId: string | null
  igContainerId: string | null
  igMediaId: string | null
  error: string | null
  publishedAt: string | null
}

function toQueueItem(row: Record<string, unknown>): QueueItem {
  return {
    id: String(row.id),
    position: num(row.position),
    kind: row.kind === "image" ? "image" : "video",
    fileName: str(row.file_name) ?? "",
    mediaUrl: str(row.media_url),
    mediaType: str(row.media_type) ?? "",
    bytes: num(row.bytes),
    caption: str(row.caption) ?? "",
    toFacebook: row.to_facebook !== false,
    toInstagram: row.to_instagram !== false,
    scheduledAt: isoOrNull(row.scheduled_at),
    status: (str(row.status) ?? "queued") as QueueStatus,
    fbPostId: str(row.fb_post_id),
    igContainerId: str(row.ig_container_id),
    igMediaId: str(row.ig_media_id),
    error: str(row.error),
    publishedAt: isoOrNull(row.published_at),
  }
}

function queueRows(result: unknown): QueueItem[] {
  return Array.isArray(result)
    ? result.map((row) => toQueueItem(row as Record<string, unknown>))
    : []
}

/** Waiting and in-progress items in order, then the latest posted ones. */
export async function listQueue(): Promise<QueueItem[]> {
  const sql = await db()
  const open = queueRows(
    await sql`SELECT * FROM post_queue WHERE status <> 'published' ORDER BY scheduled_at NULLS LAST, position`
  )
  const done = queueRows(
    await sql`SELECT * FROM post_queue WHERE status = 'published' ORDER BY published_at DESC NULLS LAST LIMIT 60`
  )
  return [...open, ...done]
}

export async function getQueueItem(id: string): Promise<QueueItem | null> {
  const sql = await db()
  return queueRows(await sql`SELECT * FROM post_queue WHERE id = ${id}`)[0] ?? null
}

export async function insertQueueItems(
  items: Array<{
    kind: "video" | "image"
    fileName: string
    mediaUrl: string
    mediaType: string
    bytes: number
    caption: string
  }>
): Promise<void> {
  const sql = await db()
  const result = await sql`SELECT COALESCE(MAX(position), 0) AS top FROM post_queue`
  let position = num(Array.isArray(result) ? (result[0] as Record<string, unknown>)?.top : 0)
  for (const item of items) {
    position += 1
    await sql`INSERT INTO post_queue (position, kind, file_name, media_url, media_type, bytes, caption)
      VALUES (${position}, ${item.kind}, ${item.fileName}, ${item.mediaUrl}, ${item.mediaType}, ${item.bytes}, ${item.caption})`
  }
}

export async function setQueueCaption(id: string, caption: string): Promise<void> {
  const sql = await db()
  await sql`UPDATE post_queue SET caption = ${caption}, updated_at = now() WHERE id = ${id}`
}

export async function setQueueTargets(id: string, facebook: boolean, instagram: boolean): Promise<void> {
  const sql = await db()
  await sql`UPDATE post_queue SET to_facebook = ${facebook}, to_instagram = ${instagram}, updated_at = now() WHERE id = ${id}`
}

export async function setQueuePosition(id: string, position: number): Promise<void> {
  const sql = await db()
  await sql`UPDATE post_queue SET position = ${position}, updated_at = now() WHERE id = ${id}`
}

export async function setQueueSchedule(id: string, at: string | null): Promise<void> {
  const sql = await db()
  await sql`UPDATE post_queue SET scheduled_at = ${at}, updated_at = now() WHERE id = ${id}`
}

export async function saveQueuePublish(
  id: string,
  fields: {
    status: QueueStatus
    fbPostId: string | null
    igContainerId: string | null
    igMediaId: string | null
    error: string | null
  }
): Promise<void> {
  const sql = await db()
  const done = fields.status === "published" || fields.status === "partial"
  await sql`UPDATE post_queue SET status = ${fields.status}, fb_post_id = ${fields.fbPostId},
    ig_container_id = ${fields.igContainerId}, ig_media_id = ${fields.igMediaId},
    error = ${fields.error},
    published_at = CASE WHEN ${done} THEN COALESCE(published_at, now()) ELSE published_at END,
    updated_at = now() WHERE id = ${id}`
}

/** After posting: the file is gone from storage, the record stays. */
export async function clearQueueMedia(id: string): Promise<void> {
  const sql = await db()
  await sql`UPDATE post_queue SET media_url = NULL, bytes = 0, updated_at = now() WHERE id = ${id}`
}

export async function resetQueueItem(id: string): Promise<void> {
  const sql = await db()
  await sql`UPDATE post_queue SET status = 'queued', error = NULL,
    ig_container_id = CASE WHEN ig_media_id IS NULL THEN NULL ELSE ig_container_id END,
    updated_at = now() WHERE id = ${id} AND status IN ('failed', 'partial')`
}

export async function deleteQueueItem(id: string): Promise<QueueItem | null> {
  const sql = await db()
  return queueRows(await sql`DELETE FROM post_queue WHERE id = ${id} RETURNING *`)[0] ?? null
}

export async function listQueuedInOrder(): Promise<QueueItem[]> {
  const sql = await db()
  return queueRows(
    await sql`SELECT * FROM post_queue WHERE status = 'queued' AND media_url IS NOT NULL ORDER BY position`
  )
}

export async function listQueuePublishing(): Promise<QueueItem[]> {
  const sql = await db()
  return queueRows(await sql`SELECT * FROM post_queue WHERE status = 'publishing'`)
}

/** The earliest queued item whose time has come. */
export async function nextDueQueueItem(nowIso: string): Promise<QueueItem | null> {
  const sql = await db()
  return (
    queueRows(await sql`SELECT * FROM post_queue
      WHERE status = 'queued' AND media_url IS NOT NULL AND scheduled_at IS NOT NULL AND scheduled_at <= ${nowIso}
      ORDER BY scheduled_at, position LIMIT 1`)[0] ?? null
  )
}

export async function queueStorageBytes(): Promise<number> {
  const sql = await db()
  const result = await sql`SELECT COALESCE(SUM(bytes), 0) AS used FROM post_queue`
  return num(Array.isArray(result) ? (result[0] as Record<string, unknown>)?.used : 0)
}
