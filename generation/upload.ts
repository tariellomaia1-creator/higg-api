import { parseUploadTicket, requireUploadContentType } from "./upload-contract"

export async function uploadMedia(file: File): Promise<{ url: string }> {
  const contentType = requireUploadContentType(file.type)
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType }),
  })
  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    throw new Error(
      `Could not prepare reference upload (${res.status}). Try again.`
    )
  }
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? payload.error
        : null
    throw new Error(
      typeof message === "string"
        ? message
        : `Could not prepare reference upload (${res.status}). Try again.`
    )
  }
  const ticket = parseUploadTicket(payload, contentType)
  // The storage request must not carry the platform key or browser cookies.
  const uploaded = await fetch(ticket.upload_url, {
    method: "PUT",
    headers: ticket.upload_headers,
    body: file,
    credentials: "omit",
  })
  if (!uploaded.ok)
    throw new Error(
      `Reference upload failed (${uploaded.status}). Try uploading the file again.`
    )
  return { url: ticket.public_url }
}
