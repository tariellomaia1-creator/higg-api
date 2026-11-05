"use client"

import { useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Clapperboard, Download, RefreshCw, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { estimateGeneration } from "@/generation/actions"
import type { CostEstimate } from "@/generation/platform"
import { getModel } from "@/generation/catalog"
import type { GenerationPlane } from "@/generation/catalog"
import { cn } from "@/lib/utils"
import { uploadAsset } from "@/lib/studio/uploads"
import {
  DEFAULT_CHARACTER_LOOK,
  LANGUAGES,
  SPEECH_MODES,
  TONES,
  characterModel,
  characterPlane,
  characterRole,
  clampDuration,
  defaultBrief,
  draftEpisodes,
  durationRange,
  episodePlane,
  episodeSrt,
  isDefaultBrief,
  seriesModels,
  type CharacterSource,
  type Episode,
  type LanguageId,
  type SeriesBrief,
  type SeriesConfig,
} from "@/lib/studio/series"

export interface SeriesOrder {
  brief: SeriesBrief
  config: SeriesConfig
  episodes: Episode[]
  /** Set when the user uploaded the character frame. */
  characterUrl?: string
}

type Step = "brief" | "style" | "script" | "launch"
const STEPS: { id: Step; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "style", label: "Style & voice" },
  { id: "script", label: "Script" },
  { id: "launch", label: "Cost & launch" },
]

type CostLine = { label: string; estimate?: CostEstimate; error?: string }

const BRIEF_FIELDS: { key: keyof SeriesBrief; label: string; hint: string }[] =
  [
    { key: "brand", label: "Brand", hint: "Company or product name" },
    { key: "offer", label: "What you sell", hint: "One sentence" },
    { key: "client", label: "Who buys it", hint: "Role and industry" },
    { key: "pain", label: "Their pain", hint: "What it costs them today" },
    { key: "result", label: "Result", hint: "Ideally with a number" },
    { key: "cta", label: "Call to action", hint: "What they should do next" },
  ]

const TEXTAREA =
  "min-h-16 w-full resize-y rounded-lg bg-white/5 px-3 py-2 text-q-body-sm-regular text-foreground outline-none placeholder:text-q-text-tertiary focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Mini-series engine dialog: B2B brief → style and voice → editable script →
 * live cost estimate → launch. Submission is the studio's job (`onLaunch`);
 * this dialog only shapes the order and prices it on the user's key.
 */
export function SeriesDialog({
  open,
  onOpenChange,
  keyConfigured,
  onNeedKey,
  onLaunch,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  keyConfigured: boolean
  onNeedKey: () => void
  onLaunch: (order: SeriesOrder) => Promise<void>
}) {
  const models = useMemo(() => seriesModels(), [])
  const imageModel = useMemo(() => characterModel(), [])
  const [step, setStep] = useState<Step>("brief")
  const [language, setLanguage] = useState<LanguageId>("ka")
  const [brief, setBrief] = useState<SeriesBrief>(() => defaultBrief("ka"))
  const [config, setConfig] = useState<SeriesConfig>(() => ({
    language: "ka",
    speech: "voiceover",
    tone: "corporate",
    modelId: models[0]?.id ?? "",
    duration: 10,
    character: imageModel ? "generate" : "none",
    characterLook: DEFAULT_CHARACTER_LOOK,
  }))
  // The script follows the brief until the user edits it by hand.
  const [editedEpisodes, setEditedEpisodes] = useState<Episode[] | null>(null)
  const drafted = useMemo(
    () => draftEpisodes(brief, language),
    [brief, language]
  )
  const episodes = editedEpisodes ?? drafted
  const scriptEdited = editedEpisodes !== null
  const [characterUrl, setCharacterUrl] = useState<string>()
  const [uploading, setUploading] = useState(false)
  const [costs, setCosts] = useState<CostLine[]>([])
  const [pricing, setPricing] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const model = models.find((m) => m.id === config.modelId) ?? models[0]
  const range = model ? durationRange(model) : { min: 5, max: 5 }
  const carriesCharacter = model ? characterRole(model) !== null : false
  const stepIndex = STEPS.findIndex((s) => s.id === step)

  const patchConfig = (patch: Partial<SeriesConfig>) =>
    setConfig((current) => ({ ...current, ...patch }))

  const changeLanguage = (next: LanguageId) => {
    // Untouched demo copy follows the language; the user's own words stay.
    const nextBrief = isDefaultBrief(brief, language)
      ? defaultBrief(next)
      : brief
    setLanguage(next)
    setBrief(nextBrief)
    patchConfig({ language: next })
    setEditedEpisodes(null)
  }

  const plansFor = (
    url?: string
  ): { label: string; plane: GenerationPlane }[] => {
    if (!model) return []
    const order: { label: string; plane: GenerationPlane }[] = []
    if (config.character === "generate" && imageModel && carriesCharacter)
      order.push({
        label: `Character frame · ${imageModel.label}`,
        plane: characterPlane(imageModel, brief, config),
      })
    episodes.forEach((episode, i) =>
      order.push({
        label: `Episode ${i + 1} · ${episode.title} · ${clampDuration(model, config.duration)}s`,
        plane: episodePlane(model, episode, i, brief, config, url),
      })
    )
    return order
  }

  const price = async () => {
    if (!keyConfigured) {
      setCosts([])
      return
    }
    setPricing(true)
    setError(null)
    // A generated frame does not exist yet, so its episodes are priced as
    // text-to-video; an uploaded frame is priced exactly as it will be sent.
    const url = config.character === "upload" ? characterUrl : undefined
    const lines: CostLine[] = []
    for (const { label, plane } of plansFor(url)) {
      try {
        lines.push({ label, ...(await estimateGeneration(plane)) })
      } catch (caught) {
        lines.push({
          label,
          error: caught instanceof Error ? caught.message : String(caught),
        })
      }
    }
    setCosts(lines)
    setPricing(false)
  }

  /** Entering the last step prices the order; Recalculate covers later edits. */
  const goTo = (next: Step) => {
    setStep(next)
    if (next === "launch") void price()
  }

  const totalUsd = costs.reduce((sum, l) => sum + (l.estimate?.usd ?? 0), 0)
  // Credits only add up when every line was quoted exactly.
  const exactAll = costs.every((l) => l.estimate?.credits != null)
  const totalCredits = costs.reduce(
    (sum, l) => sum + (l.estimate?.credits ?? 0),
    0
  )
  const approximate = costs.some((l) => l.estimate?.approximate)
  const pricedAll = costs.length > 0 && costs.every((line) => line.estimate)

  const briefValid = BRIEF_FIELDS.every(({ key }) => brief[key].trim())
  const characterReady =
    config.character !== "upload" || !carriesCharacter || Boolean(characterUrl)
  const scriptValid = episodes.every(
    (e) =>
      e.title.trim() &&
      e.scene.trim() &&
      (config.speech === "dialogue"
        ? e.question.trim() && e.answer.trim()
        : config.speech === "none" || e.line.trim())
  )
  // What still blocks each step; empty means the step is complete.
  const missing: Record<Step, string> = {
    brief: briefValid ? "" : "Fill in every brief field.",
    style: !model
      ? "No video model with audio and 9:16 is installed."
      : !characterReady
        ? "Upload the character photo or pick another option."
        : config.characterLook.trim()
          ? ""
          : "Describe who appears in the episodes.",
    script: scriptValid ? "" : "Every episode needs a title, scene and lines.",
    launch: "",
  }
  /** A step opens once every step before it is complete. */
  const reachable = (index: number) =>
    STEPS.slice(0, index).every((s) => !missing[s.id])
  const canNext = !missing[step]

  const upload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      setCharacterUrl((await uploadAsset(file)).src)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setUploading(false)
    }
  }

  const launch = async () => {
    if (!keyConfigured) {
      onNeedKey()
      return
    }
    if (launching) return
    setLaunching(true)
    setError(null)
    try {
      await onLaunch({
        brief,
        config: {
          ...config,
          character: carriesCharacter ? config.character : "none",
        },
        episodes,
        ...(config.character === "upload" && characterUrl
          ? { characterUrl }
          : {}),
      })
      onOpenChange(false)
      setStep("brief")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLaunching(false)
    }
  }

  const downloadSrt = (episode: Episode, index: number) => {
    const body = episodeSrt(
      episode,
      config.speech,
      model ? clampDuration(model, config.duration) : config.duration
    )
    const link = document.createElement("a")
    link.href = URL.createObjectURL(
      new Blob([body], { type: "application/x-subrip;charset=utf-8" })
    )
    link.download = `${brief.brand.trim() || "series"}-episode-${index + 1}-${language}.srt`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const editEpisode = (index: number, patch: Partial<Episode>) =>
    setEditedEpisodes(
      episodes.map((e, i) => (i === index ? { ...e, ...patch } : e))
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            <Clapperboard className="mr-2 size-5 shrink-0 text-q-icon-secondary" />
            B2B mini-series
          </DialogTitle>
          <DialogDescription>
            Three vertical 9:16 episodes about your brand: problem, solution,
            result.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-5">
            <ol className="flex flex-wrap gap-2" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={!reachable(i)}
                    title={
                      reachable(i)
                        ? undefined
                        : missing[STEPS.find((p) => missing[p.id])!.id]
                    }
                    onClick={() => goTo(s.id)}
                    aria-current={s.id === step ? "step" : undefined}
                    className={cn(
                      "rounded-full px-3 py-1 text-q-caption-sm-medium transition-colors disabled:opacity-40",
                      s.id === step
                        ? "bg-white/15 text-foreground"
                        : "text-q-text-secondary hover:text-foreground"
                    )}
                  >
                    {i + 1}. {s.label}
                  </button>
                </li>
              ))}
            </ol>

            {step === "brief" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Language" className="sm:col-span-2">
                  <Select
                    value={language}
                    items={LANGUAGES.map((l) => ({
                      value: l.id,
                      label: l.label,
                    }))}
                    onValueChange={(v) => changeLanguage(v as LanguageId)}
                  >
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent variant="picker" surface="solid">
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {BRIEF_FIELDS.map(({ key, label, hint }) => (
                  <Field key={key} label={label}>
                    <Input
                      value={brief[key]}
                      placeholder={hint}
                      onChange={(e) =>
                        setBrief((b) => ({ ...b, [key]: e.target.value }))
                      }
                    />
                  </Field>
                ))}
              </div>
            ) : null}

            {step === "style" ? (
              <div className="flex flex-col gap-4">
                <Field label="Voice">
                  <div className="grid grid-cols-2 gap-2">
                    {SPEECH_MODES.map((mode) => (
                      <Choice
                        key={mode.id}
                        active={config.speech === mode.id}
                        onClick={() => patchConfig({ speech: mode.id })}
                        title={mode.label}
                        description={mode.description}
                      />
                    ))}
                  </div>
                </Field>
                <Field label="Tone">
                  <div className="grid grid-cols-3 gap-2">
                    {TONES.map((tone) => (
                      <Choice
                        key={tone.id}
                        active={config.tone === tone.id}
                        onClick={() => patchConfig({ tone: tone.id })}
                        title={tone.label}
                      />
                    ))}
                  </div>
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Video model">
                    <Select
                      value={model?.id ?? ""}
                      items={models.map((m) => ({
                        value: m.id,
                        label: m.label,
                      }))}
                      onValueChange={(id) => {
                        const next = models.find((m) => m.id === id)
                        if (next)
                          patchConfig({
                            modelId: next.id,
                            duration: clampDuration(next, config.duration),
                          })
                      }}
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent variant="picker" surface="solid">
                        {models.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label={`Episode length · ${model ? clampDuration(model, config.duration) : config.duration}s`}
                  >
                    <Slider
                      min={range.min}
                      max={range.max}
                      step={1}
                      value={[
                        model
                          ? clampDuration(model, config.duration)
                          : config.duration,
                      ]}
                      onValueChange={(v) =>
                        patchConfig({ duration: Array.isArray(v) ? v[0]! : v })
                      }
                    />
                  </Field>
                </div>
                <Field label="Who appears in every episode">
                  <textarea
                    className={TEXTAREA}
                    value={config.characterLook}
                    onChange={(e) =>
                      patchConfig({ characterLook: e.target.value })
                    }
                  />
                </Field>
                <Field label="Character frame (keeps the face the same)">
                  {carriesCharacter ? (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            ["generate", "Generate", Boolean(imageModel)],
                            ["upload", "Upload photo", true],
                            ["none", "None", true],
                          ] as [CharacterSource, string, boolean][]
                        ).map(([id, label, available]) =>
                          available ? (
                            <Choice
                              key={id}
                              active={config.character === id}
                              onClick={() => patchConfig({ character: id })}
                              title={label}
                            />
                          ) : null
                        )}
                      </div>
                      {config.character === "upload" ? (
                        <div className="flex items-center gap-3">
                          {characterUrl ? (
                            <span className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={characterUrl}
                                alt="Character frame"
                                className="h-20 w-[45px] rounded-md object-cover"
                              />
                              <button
                                type="button"
                                aria-label="Remove character photo"
                                onClick={() => setCharacterUrl(undefined)}
                                className="absolute -top-2 -right-2 rounded-full bg-background p-0.5"
                              >
                                <X className="size-3.5" />
                              </button>
                            </span>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={uploading || !keyConfigured}
                            onClick={() => fileRef.current?.click()}
                          >
                            <Upload />
                            {uploading
                              ? "Uploading…"
                              : characterUrl
                                ? "Replace photo"
                                : "Choose photo"}
                          </Button>
                          {!keyConfigured ? (
                            <span className="text-q-caption-sm-regular text-q-text-secondary">
                              Connect your API key to upload.
                            </span>
                          ) : null}
                          <input
                            ref={fileRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            hidden
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              e.target.value = ""
                              if (file) void upload(file)
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-q-caption-sm-regular text-q-text-secondary">
                      {model?.label} cannot take a character frame; the
                      description above keeps the cast consistent.
                    </p>
                  )}
                </Field>
              </div>
            ) : null}

            {step === "script" ? (
              <div className="flex flex-col gap-4">
                {episodes.map((episode, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-2 rounded-xl bg-white/5 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        aria-label={`Episode ${i + 1} title`}
                        value={episode.title}
                        onChange={(e) =>
                          editEpisode(i, { title: e.target.value })
                        }
                        start={
                          <span className="text-q-caption-sm-medium text-q-text-secondary">
                            {i + 1}
                          </span>
                        }
                      />
                      {config.speech !== "none" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadSrt(episode, i)}
                        >
                          <Download />
                          SRT
                        </Button>
                      ) : null}
                    </div>
                    <Field label="Scene (English direction for the model)">
                      <textarea
                        className={TEXTAREA}
                        value={episode.scene}
                        onChange={(e) =>
                          editEpisode(i, { scene: e.target.value })
                        }
                      />
                    </Field>
                    {config.speech === "dialogue" ? (
                      <>
                        <Field label="Client says">
                          <textarea
                            className={TEXTAREA}
                            value={episode.question}
                            onChange={(e) =>
                              editEpisode(i, { question: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Consultant answers">
                          <textarea
                            className={TEXTAREA}
                            value={episode.answer}
                            onChange={(e) =>
                              editEpisode(i, { answer: e.target.value })
                            }
                          />
                        </Field>
                      </>
                    ) : config.speech !== "none" ? (
                      <Field
                        label={
                          config.speech === "voiceover"
                            ? "Narrator says"
                            : "Host says"
                        }
                      >
                        <textarea
                          className={TEXTAREA}
                          value={episode.line}
                          onChange={(e) =>
                            editEpisode(i, { line: e.target.value })
                          }
                        />
                      </Field>
                    ) : null}
                  </div>
                ))}
                {scriptEdited ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => setEditedEpisodes(null)}
                  >
                    <RefreshCw />
                    Rebuild script from brief
                  </Button>
                ) : null}
              </div>
            ) : null}

            {step === "launch" ? (
              <div className="flex flex-col gap-3">
                {!keyConfigured ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3 text-q-body-sm-regular">
                    <span>Connect your API key to see live prices.</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onNeedKey}
                    >
                      Connect API key
                    </Button>
                  </div>
                ) : (
                  <>
                    <ul className="flex flex-col divide-y divide-white/10 rounded-xl bg-white/5">
                      {(costs.length
                        ? costs
                        : plansFor().map(
                            (p) => ({ label: p.label }) as CostLine
                          )
                      ).map((line) => (
                        <li
                          key={line.label}
                          className="flex flex-col gap-1 px-3 py-2.5 text-q-body-sm-regular"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate">
                              {line.label}
                            </span>
                            <span className="shrink-0 text-right tabular-nums">
                              {line.estimate ? (
                                formatCost(line.estimate)
                              ) : line.error ? (
                                <span className="text-q-state-error-fg">
                                  Not priced
                                </span>
                              ) : (
                                <span className="text-q-text-secondary">…</span>
                              )}
                            </span>
                          </div>
                          {line.error ? (
                            <span className="text-q-caption-sm-regular break-words text-q-state-error-fg">
                              {line.error}
                            </span>
                          ) : null}
                        </li>
                      ))}
                      <li className="flex items-center justify-between gap-3 px-3 py-3 text-q-body-sm-medium">
                        <span>Total</span>
                        <span className="tabular-nums">
                          {pricing
                            ? "Calculating…"
                            : exactAll
                              ? `${formatCredits(totalCredits)} cr · ${formatUsd(totalUsd)}`
                              : `${approximate ? "≈ " : ""}${formatUsd(totalUsd)}`}
                        </span>
                      </li>
                    </ul>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-q-caption-sm-regular text-q-text-secondary">
                        Live estimate from Higgsfield for your key.
                        {config.character === "generate" && carriesCharacter
                          ? " Episodes are priced before the frame exists; with it attached the price can differ slightly."
                          : ""}
                        {approximate
                          ? " ≈ lines use the model's published per-second rate × length; Higgsfield bills them by output tokens."
                          : ""}
                        {!pricedAll && costs.length
                          ? " Some lines could not be priced."
                          : ""}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pricing}
                        onClick={() => void price()}
                      >
                        <RefreshCw />
                        Recalculate
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {missing[step] ? (
              <p className="text-q-caption-sm-regular text-q-text-secondary">
                {missing[step]}
              </p>
            ) : null}
            {error ? (
              <p className="text-q-caption-sm-regular text-q-state-error-fg">
                {error}
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter
          caption={
            stepIndex > 0 ? (
              <button
                type="button"
                onClick={() => setStep(STEPS[stepIndex - 1]!.id)}
                className="text-q-caption-sm-medium text-q-text-secondary hover:text-q-text-primary"
              >
                Back
              </button>
            ) : undefined
          }
        >
          {step === "launch" ? (
            <Button
              type="button"
              disabled={launching || pricing || !keyConfigured || !pricedAll}
              onClick={() => void launch()}
            >
              {launching ? "Starting…" : "Generate series"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={!canNext}
              onClick={() => goTo(STEPS[stepIndex + 1]!.id)}
            >
              Next
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    // A div, not a <label>: a label wrapping several buttons, a slider or a
    // select forwards clicks to its first control and steals the choice.
    <div
      role="group"
      aria-label={label}
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
    >
      <span className="text-q-caption-sm-medium text-q-text-secondary">
        {label}
      </span>
      {children}
    </div>
  )
}

function Choice({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean
  onClick: () => void
  title: string
  description?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-q-brand-primary bg-white/10"
          : "border-white/10 bg-white/5 hover:bg-white/8"
      )}
    >
      <span className="text-q-body-sm-medium">{title}</span>
      {description ? (
        <span className="text-q-caption-sm-regular text-q-text-secondary">
          {description}
        </span>
      ) : null}
    </button>
  )
}

function formatCost(estimate: CostEstimate) {
  if (estimate.credits == null || estimate.approximate)
    return `≈ ${formatUsd(estimate.usd)}`
  return `${formatCredits(estimate.credits)} cr · ${formatUsd(estimate.usd)}`
}

function formatCredits(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

function formatUsd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })
}

/** Resolves the model a saved order points at; the catalog is the source. */
export function orderModel(order: SeriesOrder) {
  return getModel(order.config.modelId)
}
