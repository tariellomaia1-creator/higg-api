import { t2v, videoModel } from "../defaults"

export default videoModel(
  "flux-3",
  "Flux 3",
  { start: 1 },
  t2v("blackforestlabs/flux-3/text-to-video"),
  {
    icon: "flux",
    order: 54,
  }
)
