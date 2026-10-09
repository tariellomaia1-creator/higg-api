import { t2v, videoModel } from "../defaults"

export default videoModel(
  "minimax-h3",
  "MiniMax H3",
  { start: 1 },
  t2v("minimax/h3/text-to-video"),
  {
    icon: "minimax",
    order: 55,
  }
)
