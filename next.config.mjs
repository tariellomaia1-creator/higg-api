import { syncModels, watchModels } from "./scripts/sync-models.mjs"

// Keep the model barrel + registry items in sync with generation/catalog/models/*.
syncModels()
if (process.env.NODE_ENV === "development") watchModels()

// The queue badges videos with ffmpeg (daily/brand.ts): ship the binary and
// the badge image with the functions that run it.
const BRANDING_FILES = [
  "./node_modules/@ffmpeg-installer/linux-x64/ffmpeg",
  "./daily/assets/watermark.png",
]

/** Plain JavaScript (not next.config.ts): hosts with an older glibc, such
    as Hostinger, cannot load the native SWC that compiles a TS config.
    @type {import("next").NextConfig} */
const nextConfig = {
  agentRules: false,
  outputFileTracingIncludes: {
    "/api/cron/tick": BRANDING_FILES,
    "/queue": BRANDING_FILES,
    "/queue/instagram": BRANDING_FILES,
    "/queue/c/[channel]": BRANDING_FILES,
  },
}

export default nextConfig
