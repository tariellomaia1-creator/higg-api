import { MODELS } from "@/generation/catalog"
import { StudioTemplate } from "@/layouts/studio"

import { NoModels } from "@/components/studio/no-models"

export default function StudioPage() {
  if (MODELS.length === 0) return <NoModels />
  return <StudioTemplate />
}
