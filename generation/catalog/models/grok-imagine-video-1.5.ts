import { videoModel } from "../defaults"

export default videoModel(
  "grok-imagine-video-1.5",
  "Grok Imagine Video 1.5",
  { reference: 8, video: 3 },
  { reference: "xai/grok-imagine-video/v1.5/reference-to-video" },
  { icon: "grok", order: 65 }
)
