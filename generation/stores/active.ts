import { create } from "zustand"
import { persist } from "zustand/middleware"

import { defaultModel, getModel } from "../catalog"
import type { Surface } from "../catalog/types"
import { browserStorage } from "./browser-storage"

/** Results one press of Generate produces. Models that do not carry a count of
    their own are submitted once per result — every unit is a real platform
    request — so the ceiling is deliberately small. */
export const MAX_BATCH = 4

type ActiveState = {
  surface: Surface
  model: string
  batch: number
  setModel: (id: string) => void
  setBatch: (count: number) => void
}

export const useActive = create<ActiveState>()(
  persist(
    (set) => ({
      surface: defaultModel()?.surface ?? "video",
      model: defaultModel()?.id ?? "",
      batch: 1,
      setModel: (id) => {
        const model = getModel(id)
        set((state) =>
          state.model === model.id && state.surface === model.surface
            ? state
            : { model: model.id, surface: model.surface }
        )
      },
      setBatch: (count) =>
        set((state) => {
          const batch = Math.min(MAX_BATCH, Math.max(1, Math.round(count)))
          return state.batch === batch ? state : { batch }
        }),
    }),
    {
      name: "hf.active.v2",
      storage: browserStorage(),
      partialize: (state) => ({
        surface: state.surface,
        model: state.model,
        batch: state.batch,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        try {
          getModel(state.model)
        } catch {
          const fallback = defaultModel()
          if (fallback) state.setModel(fallback.id)
        }
      },
    }
  )
)
