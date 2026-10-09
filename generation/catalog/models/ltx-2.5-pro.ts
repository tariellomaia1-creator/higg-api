import { t2v, videoModel } from "../defaults"

export default videoModel(
  "ltx-2.5-pro",
  "LTX 2.5 Pro",
  { start: 1 },
  t2v("lightricks/ltx-2.5/text-to-video/pro"),
  { icon: "ltx", order: 64 }
)
