/**
 * Seedance 2.5 text-to-video through the official Higgsfield SDK.
 *
 *   pnpm seedance:example
 *
 * Reads HF_CREDENTIALS (key-id:key-secret) from .env.local at runtime and
 * never prints it. This is a billable generation request.
 */
import {
  AuthenticationError,
  CredentialsMissedError,
  NotEnoughCreditsError,
  TimeoutError,
  config,
  higgsfield,
} from "@higgsfield/client/v2"

const MODEL = "bytedance/seedance-2.5/text-to-video"

async function main(): Promise<number> {
  const credentials = process.env.HF_CREDENTIALS?.trim()
  if (!credentials) {
    console.error(
      "HF_CREDENTIALS is not set. Add it to .env.local as key-id:key-secret."
    )
    return 1
  }
  // Seedance 720p usually finishes in a few minutes; the SDK keeps polling a
  // canceled request, so this deadline is what ends that case.
  config({ credentials, maxPollTime: 15 * 60_000, pollInterval: 5_000 })

  console.log(`Submitting ${MODEL}…`)
  const result = await higgsfield.subscribe(MODEL, {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  })

  // Typed as V2RequestStatus, but the platform can also answer "canceled".
  const status: string = result.status
  console.log(`Request ${result.request_id}: ${status}`)
  if (status === "completed" && result.video?.url) {
    console.log(`Video URL: ${result.video.url}`)
    return 0
  }
  if (status === "completed")
    console.error("Completed, but the response carried no video URL.")
  else if (status === "nsfw")
    console.error("Blocked by content moderation (nsfw). Not charged.")
  else if (status === "failed")
    console.error("Generation failed on the platform. Not charged.")
  else if (status === "canceled") console.error("The request was canceled.")
  else console.error(`Stopped in a non-terminal state: ${status}`)
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((caught: unknown) => {
    if (caught instanceof CredentialsMissedError)
      console.error("HF_CREDENTIALS must be key-id:key-secret.")
    else if (caught instanceof AuthenticationError)
      console.error("Higgsfield rejected the credentials (401).")
    else if (caught instanceof NotEnoughCreditsError)
      console.error("Not enough API credits on this account (403).")
    else if (caught instanceof TimeoutError)
      console.error(`No terminal status in time: ${caught.message}`)
    else
      console.error(
        `Request failed: ${caught instanceof Error ? caught.message : String(caught)}`
      )
    process.exit(1)
  })
