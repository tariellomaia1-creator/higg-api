# Studio layout contract

`studio.tsx` is the full creative workspace. Six structural parts stay intact
when adapting; replace their content, not their presence:

1. **Projects-first sidebar** (`StudioSidebar`): Home, All Generations, the
   project list with rename/delete, the key status row. Collapsible.
2. **Atmosphere**: `HERO_GLOW` radial glow and `HERO_DOTS` dot-field masked by
   `HERO_DOTS_MASK` behind the hero. Tune colours, keep the depth.
3. **`HeroComposition`**: three latest ready outputs, falling back to
   `/presets/placeholder-*.svg` until the product has real media.
4. **`StudioPromptBox` dock**: mode rail (surfaces), one headline setting pill,
   the settings dialog pill, one mixed reference picker, compact media chips,
   model-appropriate frame/source slots, and the lime Generate CTA that turns
   into Cancel while running. Home renders it inline; feed views
   render it floating over one smooth bottom scrim.
5. **Explore / My Projects** section under the dock with at least two
   `TemplateItem` presets in `components/studio/template-picker.tsx`.
6. **`UserGenerations` feed**: edge-to-edge, virtualized, justified rows;
   generating and failed tiles stay visible.

Rules:

- Studio is full-bleed: no `max-w-*` container on the shell.
- One controlled dock state (`prompt`, `media`, active model and settings) is
  shared by Home and feed views. Infer input mode from media; do not fork state.
- View state is `{ kind: "home" | "all" | "project" }`; a project view filters
  `galleryItems` by `projectId` — do not keep a second history.
- All shipped presets, hero fallbacks and template copy are placeholders and
  must be replaced before shipping.
