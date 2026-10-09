import { t2v, videoModel } from "../defaults"

export default videoModel(
  "wan-2.7",
  "Wan 2.7",
  { start: 1 },
  t2v("wan/v2.7/text-to-video"),
  {
    icon: "wan",
    order: 52,
  }
)
