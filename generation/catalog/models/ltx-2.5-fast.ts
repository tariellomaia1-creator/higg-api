import { t2v, videoModel } from "../defaults"

export default videoModel(
  "ltx-2.5-fast",
  "LTX 2.5 Fast",
  { start: 1 },
  t2v("lightricks/ltx-2.5/text-to-video/fast"),
  { icon: "ltx", order: 63 }
)
