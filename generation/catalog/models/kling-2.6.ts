import { t2v, videoModel } from "../defaults"

export default videoModel(
  "kling-2.6",
  "Kling 2.6",
  { start: 1 },
  t2v("kling-video/v2.6/pro/text-to-video"),
  {
    icon: "kling",
    order: 59,
  }
)
