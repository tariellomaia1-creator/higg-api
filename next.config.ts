import type { NextConfig } from "next"

import { syncModels, watchModels } from "./scripts/sync-models.mjs"

// Keep the model barrel + registry items in sync with generation/catalog/models/*.
syncModels()
if (process.env.NODE_ENV === "development") watchModels()

const nextConfig: NextConfig = { agentRules: false }

export default nextConfig
