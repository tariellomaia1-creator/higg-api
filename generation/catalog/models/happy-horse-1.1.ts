import { t2v, videoModel } from "../defaults"

export default videoModel(
  "happy-horse-1.1",
  "Happy Horse 1.1",
  { start: 1 },
  t2v("alibaba/happy-horse/v1.1/text-to-video"),
  { icon: "happy-horse", order: 58 }
)
