import { t2v, videoModel } from "../defaults"

export default videoModel(
  "minimax-hailuo-2.3",
  "MiniMax Hailuo 2.3",
  { start: 1 },
  t2v("minimax/hailuo-2.3/standard/text-to-video"),
  { icon: "minimax", order: 56 }
)
