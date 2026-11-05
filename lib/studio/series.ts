import { MODELS } from "@/generation/catalog"
import { inferInputMode } from "@/generation/catalog/media-inputs"
import type {
  GenerationPlane,
  MediaItem,
  ModelEntry,
} from "@/generation/catalog"

/**
 * Mini-series engine: a B2B brief becomes a three-episode vertical series.
 * Brief → script (editable, from per-language templates) → optional character
 * frame shared by every episode → one generation plane per episode.
 * Pure data; the dialog owns state and the studio owns submission.
 */

export const SERIES_ASPECT = "9:16"
export const EPISODE_COUNT = 3

export type LanguageId = "ka" | "en" | "ru" | "de" | "tr"
export type SpeechMode = "voiceover" | "on-camera" | "dialogue" | "none"
export type ToneId = "corporate" | "friendly" | "premium"
export type CharacterSource = "none" | "generate" | "upload"

export const LANGUAGES: { id: LanguageId; label: string; english: string }[] = [
  { id: "ka", label: "ქართული", english: "Georgian" },
  { id: "en", label: "English", english: "English" },
  { id: "ru", label: "Русский", english: "Russian" },
  { id: "de", label: "Deutsch", english: "German" },
  { id: "tr", label: "Türkçe", english: "Turkish" },
]

export const SPEECH_MODES: {
  id: SpeechMode
  label: string
  description: string
}[] = [
  {
    id: "voiceover",
    label: "Voiceover",
    description: "An off-screen narrator tells the story",
  },
  {
    id: "on-camera",
    label: "On camera",
    description: "A host speaks straight to the viewer",
  },
  {
    id: "dialogue",
    label: "Dialogue",
    description: "A client and your consultant talk",
  },
  {
    id: "none",
    label: "No speech",
    description: "Music and ambience only",
  },
]

export const TONES: { id: ToneId; label: string; style: string }[] = [
  {
    id: "corporate",
    label: "Corporate",
    style:
      "clean corporate cinematography, modern glass office, cool neutral grade, steady gimbal moves",
  },
  {
    id: "friendly",
    label: "Friendly",
    style:
      "warm natural light, relaxed handheld feel, bright open workspace, approachable people",
  },
  {
    id: "premium",
    label: "Premium",
    style:
      "premium commercial look, dramatic contrast, shallow depth of field, slow dolly moves, rich dark palette",
  },
]

export interface SeriesBrief {
  brand: string
  offer: string
  client: string
  pain: string
  result: string
  cta: string
}

export interface Episode {
  title: string
  /** Visual direction, English, sent to the model. */
  scene: string
  /** Narration / host line in the chosen language. */
  line: string
  /** Dialogue mode: the client's line and the consultant's answer. */
  question: string
  answer: string
}

export interface SeriesConfig {
  language: LanguageId
  speech: SpeechMode
  tone: ToneId
  modelId: string
  duration: number
  character: CharacterSource
  /** Who appears across the series; also the character-frame prompt. */
  characterLook: string
}

type Lines = {
  titles: [string, string, string]
  line: [string, string, string]
  question: [string, string, string]
  answer: [string, string, string]
  defaults: SeriesBrief
}

// {brand} {offer} {client} {pain} {result} {cta} are filled from the brief.
const TEMPLATES: Record<LanguageId, Lines> = {
  ka: {
    titles: ["პრობლემა", "გადაწყვეტა", "შედეგი"],
    line: [
      "{pain} — ყოველ კვირა ეს თქვენს ბიზნესს დროდ და ფულად უჯდება.",
      "{brand} — {offer}. ამუშავება დღეებში და არა თვეებში.",
      "{result}. {cta}",
    ],
    question: [
      "{pain} — და ვერ ვხვდებით, როგორ შევცვალოთ.",
      "რამდენი ხანი სჭირდება დაწყებას?",
      "{result} — არ მჯეროდა, რომ შესაძლებელი იყო.",
    ],
    answer: [
      "მარტო არ ხართ. გაჩვენებთ, რას ცვლის {brand}.",
      "დღეები და არა თვეები. {brand} — {offer}.",
      "ეს არის {brand}. {cta}",
    ],
    defaults: {
      brand: "BeHero AI Video",
      offer: "სარეკლამო ვიდეო თქვენი ბიზნესისთვის წუთებში, გადაღების გარეშე",
      client: "მარკეტინგის მენეჯერები და კომპანიის ხელმძღვანელები",
      pain: "ვიდეოს გადაღება კვირებს და ათასობით ლარს მოითხოვს",
      result: "ვიდეოს წარმოების ხარჯი ხუთჯერ ნაკლები",
      cta: "დაგვიკავშირდით behero.ge-ზე",
    },
  },
  en: {
    titles: ["The problem", "The solution", "The result"],
    line: [
      "{pain} — and every week it costs your business time and money.",
      "{brand}: {offer}. Up and running in days, not months.",
      "{result}. {cta}",
    ],
    question: [
      "{pain} — and we don't know how to fix it.",
      "How long does it take to get started?",
      "{result} — I didn't believe it was possible.",
    ],
    answer: [
      "You're not alone. Let me show you what {brand} changes.",
      "Days, not months. {brand}: {offer}.",
      "That's {brand}. {cta}",
    ],
    defaults: {
      brand: "BeHero AI Video",
      offer: "ad-ready video for your business in minutes, no film crew",
      client: "marketing managers and company owners",
      pain: "A single video shoot takes weeks and thousands of dollars",
      result: "Five times lower video production costs",
      cta: "Book a demo at behero.ge",
    },
  },
  ru: {
    titles: ["Проблема", "Решение", "Результат"],
    line: [
      "{pain} — и каждую неделю это стоит вашему бизнесу времени и денег.",
      "{brand} — {offer}. Запуск за дни, а не за месяцы.",
      "{result}. {cta}",
    ],
    question: [
      "{pain} — и мы не понимаем, как это изменить.",
      "Сколько времени нужно на запуск?",
      "{result} — я не верил, что это возможно.",
    ],
    answer: [
      "Вы не одни. Покажу, что меняет {brand}.",
      "Дни, а не месяцы. {brand} — {offer}.",
      "Это {brand}. {cta}",
    ],
    defaults: {
      brand: "BeHero AI Video",
      offer:
        "рекламное видео для вашего бизнеса за минуты, без съёмочной группы",
      client: "маркетинг-менеджеры и владельцы компаний",
      pain: "Одна съёмка занимает недели и стоит тысячи долларов",
      result: "Производство видео в пять раз дешевле",
      cta: "Запишитесь на демо на behero.ge",
    },
  },
  de: {
    titles: ["Das Problem", "Die Lösung", "Das Ergebnis"],
    line: [
      "{pain} – und jede Woche kostet das Ihr Unternehmen Zeit und Geld.",
      "{brand}: {offer}. Startklar in Tagen, nicht in Monaten.",
      "{result}. {cta}",
    ],
    question: [
      "{pain} – und wir wissen nicht, wie wir das ändern.",
      "Wie lange dauert der Start?",
      "{result} – ich hätte es nicht für möglich gehalten.",
    ],
    answer: [
      "Sie sind nicht allein. Ich zeige Ihnen, was {brand} verändert.",
      "Tage, nicht Monate. {brand}: {offer}.",
      "Das ist {brand}. {cta}",
    ],
    defaults: {
      brand: "BeHero AI Video",
      offer:
        "werbefertige Videos für Ihr Unternehmen in Minuten, ohne Filmteam",
      client: "Marketingleiter und Geschäftsführer",
      pain: "Ein einziger Videodreh dauert Wochen und kostet Tausende",
      result: "Fünfmal niedrigere Videoproduktionskosten",
      cta: "Buchen Sie eine Demo auf behero.ge",
    },
  },
  tr: {
    titles: ["Sorun", "Çözüm", "Sonuç"],
    line: [
      "{pain} — ve bu her hafta işletmenize zaman ve paraya mal oluyor.",
      "{brand}: {offer}. Aylar değil, günler içinde devrede.",
      "{result}. {cta}",
    ],
    question: [
      "{pain} — ve bunu nasıl değiştireceğimizi bilmiyoruz.",
      "Başlamak ne kadar sürer?",
      "{result} — mümkün olduğuna inanmamıştım.",
    ],
    answer: [
      "Yalnız değilsiniz. {brand} neyi değiştiriyor, göstereyim.",
      "Aylar değil, günler. {brand}: {offer}.",
      "İşte {brand}. {cta}",
    ],
    defaults: {
      brand: "BeHero AI Video",
      offer:
        "işletmeniz için dakikalar içinde, çekim ekibi olmadan reklam videosu",
      client: "pazarlama yöneticileri ve şirket sahipleri",
      pain: "Tek bir video çekimi haftalar sürüyor ve binlerce dolara mal oluyor",
      result: "Video üretim maliyeti beş kat daha düşük",
      cta: "behero.ge üzerinden demo ayırtın",
    },
  },
}

// Visual beats of the B2B arc, filled with the brief. English on purpose:
// the models follow English direction best; spoken lines stay in-language.
const SCENES: [string, string, string] = [
  "{client} at work late in the evening, buried in manual tasks, spreadsheets and missed deadlines; tense close-ups, a frustrated glance at the clock.",
  "The same office the next morning: the team discovers {brand} ({offer}); clean dashboards on screens, people collaborating, a confident walk-and-talk.",
  "Weeks later: a bright meeting room, the team reviews measurable results ({result}), a handshake with a client, golden-hour skyline; the final shot holds on a confident smile.",
]

export const DEFAULT_CHARACTER_LOOK =
  "a confident business consultant in her early 30s, dark hair, navy blazer, warm and trustworthy"

export function defaultBrief(language: LanguageId): SeriesBrief {
  return { ...TEMPLATES[language].defaults }
}

/** True when the brief still holds a language's untouched defaults. */
export function isDefaultBrief(brief: SeriesBrief, language: LanguageId) {
  const defaults = TEMPLATES[language].defaults
  return (Object.keys(defaults) as (keyof SeriesBrief)[]).every(
    (key) => brief[key] === defaults[key]
  )
}

function fill(template: string, brief: SeriesBrief): string {
  return template
    .replace(/\{(brand|offer|client|pain|result|cta)\}/g, (_, key) =>
      brief[key as keyof SeriesBrief].trim()
    )
    .replace(/\s+/g, " ")
    .trim()
}

export function draftEpisodes(
  brief: SeriesBrief,
  language: LanguageId
): Episode[] {
  const t = TEMPLATES[language]
  return [0, 1, 2].map((i) => ({
    title: t.titles[i as 0 | 1 | 2],
    scene: fill(SCENES[i as 0 | 1 | 2], brief),
    line: fill(t.line[i as 0 | 1 | 2], brief),
    question: fill(t.question[i as 0 | 1 | 2], brief),
    answer: fill(t.answer[i as 0 | 1 | 2], brief),
  }))
}

/** Video models that voice their own audio and render vertical 9:16. */
export function seriesModels(): ModelEntry[] {
  return MODELS.filter((m) => {
    if (m.surface !== "video" || m.requiredRoles?.length) return false
    const audio = m.settings.generateAudio ?? m.settings.sound
    const aspect = m.settings.aspectRatio
    return (
      audio?.type === "boolean" &&
      aspect?.type === "enum" &&
      aspect.values.includes(SERIES_ASPECT)
    )
  })
}

export function durationRange(model: ModelEntry) {
  const field = model.settings.duration
  return field?.type === "range"
    ? { min: field.min, max: field.max }
    : { min: 5, max: 5 }
}

export function clampDuration(model: ModelEntry, seconds: number) {
  const { min, max } = durationRange(model)
  return Math.min(max, Math.max(min, Math.round(seconds)))
}

/** How the character frame rides along: a reference where the model takes
    references, otherwise the start frame; null when it cannot carry one. */
export function characterRole(model: ModelEntry): "reference" | "start" | null {
  if ((model.roles.reference ?? 0) > 0) return "reference"
  if ((model.roles.start ?? 0) > 0) return "start"
  return null
}

function audioDirection(
  episode: Episode,
  config: SeriesConfig,
  language: string
): string {
  switch (config.speech) {
    case "voiceover":
      return `Audio: a calm, professional off-screen narrator speaks ${language}; nobody on screen talks. Narrator says: "${episode.line}"`
    case "on-camera":
      return `Audio: the host looks straight into the camera and speaks ${language} with natural lip-sync: "${episode.line}"`
    case "dialogue":
      return `Audio: two people talk in ${language} with natural lip-sync. The client says: "${episode.question}" The consultant answers: "${episode.answer}"`
    case "none":
      return "Audio: no speech, subtle modern corporate music and natural room ambience."
  }
}

export function episodePrompt(
  episode: Episode,
  index: number,
  brief: SeriesBrief,
  config: SeriesConfig
): string {
  const language =
    LANGUAGES.find((l) => l.id === config.language)?.english ?? "English"
  const tone = TONES.find((t) => t.id === config.tone)?.style ?? ""
  const cast =
    config.speech === "dialogue"
      ? `Characters: ${config.characterLook.trim()} as the ${brief.brand.trim()} consultant, and a busy client.`
      : config.speech === "none"
        ? ""
        : `Host: ${config.characterLook.trim()}.`
  return [
    `Vertical 9:16 B2B brand mini-series for ${brief.brand.trim()}, episode ${index + 1} of ${EPISODE_COUNT}: "${episode.title}".`,
    `Scene: ${episode.scene}`,
    cast,
    audioDirection(episode, config, language),
    `Style: ${tone}. Same characters, wardrobe, location and color grade in every episode. No on-screen text, no subtitles, no logos.`,
  ]
    .filter(Boolean)
    .join("\n")
}

export function characterPrompt(config: SeriesConfig, brief: SeriesBrief) {
  const tone = TONES.find((t) => t.id === config.tone)?.style ?? ""
  return `Vertical 9:16 portrait still of ${config.characterLook.trim()}, standing in the office of ${brief.brand.trim()}, looking at the camera, waist-up. ${tone}. Photorealistic, no text.`
}

export function episodePlane(
  model: ModelEntry,
  episode: Episode,
  index: number,
  brief: SeriesBrief,
  config: SeriesConfig,
  characterUrl?: string
): GenerationPlane {
  const role = characterUrl ? characterRole(model) : null
  const media: MediaItem[] =
    role && characterUrl
      ? [{ id: characterUrl, url: characterUrl, role, kind: "image" }]
      : []
  const settings: Record<string, unknown> = {
    aspectRatio: SERIES_ASPECT,
    duration: clampDuration(model, config.duration),
  }
  // Audio stays on even without speech: "none" still asks for music.
  if (model.settings.generateAudio) settings.generateAudio = true
  if (model.settings.sound) settings.sound = true
  return {
    model: model.id,
    inputMode: inferInputMode(model, media),
    prompt: { text: episodePrompt(episode, index, brief, config) },
    media: role ? { [role]: media } : {},
    settings,
  }
}

/** The image model that draws the shared character frame. */
export function characterModel(): ModelEntry | undefined {
  return (
    MODELS.find((m) => m.id === "soul-2") ??
    MODELS.find((m) => {
      const aspect = m.settings.aspectRatio
      return (
        m.surface === "image" &&
        aspect?.type === "enum" &&
        aspect.values.includes(SERIES_ASPECT)
      )
    })
  )
}

export function characterPlane(
  model: ModelEntry,
  brief: SeriesBrief,
  config: SeriesConfig
): GenerationPlane {
  return {
    model: model.id,
    prompt: { text: characterPrompt(config, brief) },
    media: {},
    settings: { aspectRatio: SERIES_ASPECT },
  }
}

function srtTime(seconds: number): string {
  const ms = Math.round(seconds * 1000)
  const pad = (n: number, w = 2) => String(n).padStart(w, "0")
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}

/** Subtitles for one episode, sentences spread evenly over its length.
    B2B feeds autoplay muted, so captions carry the message. */
export function episodeSrt(
  episode: Episode,
  speech: SpeechMode,
  seconds: number
): string {
  const text =
    speech === "dialogue"
      ? [episode.question, episode.answer]
      : speech === "none"
        ? []
        : episode.line.split(/(?<=[.!?…])\s+/).filter(Boolean)
  if (!text.length) return ""
  const slot = seconds / text.length
  return text
    .map(
      (cue, i) =>
        `${i + 1}\n${srtTime(i * slot)} --> ${srtTime((i + 1) * slot)}\n${cue}\n`
    )
    .join("\n")
}
