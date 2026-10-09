import { t2v, videoModel } from "../defaults"

export default videoModel(
  "pixverse-6",
  "PixVerse 6",
  { start: 1 },
  t2v("pixverse/v6/text-to-video"),
  {
    icon: "pixverse",
    order: 66,
  }
)
