# Studio components

Import these; do not fork or hand-roll replacements. Missing a prop? Extend
the component here, backward compatible.

- **`PromptBox`** (`prompt-box.tsx`): composition primitive
  (`Root / ModeRail / Mode / Body / Field / Actions / Pill / Uploads / Upload /
  Generate`). `StudioPromptBox` is the prop-driven composition on top; it caps
  inline settings at `MAX_INLINE_SETTINGS`. Use one mixed reference picker with
  compact thumbnails/audio chips; infer input mode from attachments instead of
  showing mode or role-counter controls. Image menus offer frame roles only when
  the model supports them. Frame/source slots appear only when needed. Preserve
  every attachment, with removal, and block incompatible payloads.
- **`AssetLibraryModal`** behind every "+" / add-media action: uploads tab plus
  supported image/video/audio tabs. Dispatch mixed selections by kind using
  catalog capacities; enforce per-kind limits, not only the combined count.
  Single frame/source slots replace one file.
- **`SettingsDialog`** renders every `model.settings` field from the catalog
  (enum → Select, range → Slider, boolean → switch). Add settings in the model
  file, not here.
- **`GenerationTile`** is the only renderer for one generation (feed, hero,
  wizard result). Busy = `state="generating"`, failed = `state="failed"`,
  lightbox = `GenerationDetailModal`, hover rail = `CardActions` (≤3 visible,
  rest in ⋯). A `download` action with no `onSelect` downloads the media.
- **`UserGenerations`** is the only feed of the user's generations;
  `gallery/` is its private internals — never import it directly.
- **`ScreenEmptyState`** for every empty screen: dot-fade backdrop, three
  representative images, real title/description and an optional action.
- **`ExamplePresets` / `TemplateCard`** for pick-one preset grids. Each
  `TemplateItem` carries the prompt (and optional model/settings) it applies.
- **`MyProjects`, `ProjectCreateModal`, `ProjectActions`** own project UI.
- **`KeyDialog`** is the only place that collects the platform key.

Design invariants: dark only; lime `bg-primary` is reserved for the generation
CTA and active states; ordinary actions use `ghost`/`outline` buttons; icons
are `lucide-react`; every visible control works end to end.
