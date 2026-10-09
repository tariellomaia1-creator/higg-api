import { t2v, videoModel } from "../defaults"

export default videoModel(
  "wan-3",
  "Wan 3.0",
  { start: 1 },
  t2v("alibaba/wan-3.0/text-to-video"),
  {
    icon: "wan",
    order: 50,
  }
)
