import {
  type BackgroundSlot,
  EVENTS,
  type SoundSlot,
  type ThemeSlot,
} from "@razzoozle/common/constants"
import { THEME_TOKENS } from "@razzoozle/common/theme-tokens"
import {
  DEFAULT_THEME,
  type Theme,
  type ThemeTemplate,
} from "@razzoozle/common/types/theme"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import ActionFooter from "@razzoozle/web/components/ui/ActionFooter"
import ColorPickerField from "@razzoozle/web/components/ui/ColorPickerField"
import FormSection from "@razzoozle/web/components/ui/FormSection"
import LabelRow from "@razzoozle/web/components/ui/LabelRow"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import {
  AssetPreview,
  AssetPreviewCard,
  EmptyState,
  SectionCard,
  SubGroup,
} from "@razzoozle/web/features/manager/components/console"
import AnimationControls from "@razzoozle/web/features/manager/components/configurations/AnimationControls"
import AnimatedBackgroundControls from "@razzoozle/web/features/manager/components/configurations/AnimatedBackgroundControls"
import ConfigSkeleton from "@razzoozle/web/features/manager/components/configurations/ConfigSkeleton"
import SoundControls from "@razzoozle/web/features/manager/components/configurations/SoundControls"
import ThemePreviewPanel from "@razzoozle/web/features/manager/components/configurations/theme-preview/ThemePreviewPanel"
import { applyTheme } from "@razzoozle/web/features/theme/apply"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import {
  BookMarked,
  Download,
  Image as ImageIcon,
  Palette,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type ChangeEvent, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Match the server's hard cap in saveBackgroundImage so we reject oversized
// files client-side before pushing megabytes over the socket. AssetPreview
// also guards client-side; this stays as a second line of defence.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

// The kind of theme operation currently awaiting a server response. THEME_ERROR
// carries no slot/context, so we track the last action explicitly to route the
// failure (and clear the right pending state) instead of guessing from
// pendingSlot, which can misattribute a save error to an in-flight upload slot.
type ThemeAction = "upload" | "save" | "template"

const BG_SLOTS: Array<{
  key: BackgroundSlot
  labelKey: string
  aspect: string
}> = [
  {
    key: "auth",
    labelKey: "manager:theme.bgSlots.auth",
    aspect: "aspect-[16/10]",
  },
  {
    key: "managerGame",
    labelKey: "manager:theme.bgSlots.managerGame",
    aspect: "aspect-video",
  },
  {
    key: "playerGame",
    labelKey: "manager:theme.bgSlots.playerGame",
    aspect: "aspect-[9/16]",
  },
]

// Registry-driven token pickers (contract §10). The two cards below render every
// THEME_TOKENS entry as a color input bound to its dot-path; grouping the doc's
// five `group`s into two cards keeps the editor compact. Order within a card
// follows THEME_TOKENS so it matches the SKELETON.md doc + applyTheme loop.
const TOKEN_CARDS: Array<{
  /** Stable i18n suffix + dev-default heading. */
  key: string
  defaultTitle: string
  /** THEME_TOKENS `group` values rendered in this card, in order. */
  groups: string[]
}> = [
  {
    key: "teamsTiers",
    defaultTitle: "Teams & Tiers",
    groups: ["Teams", "Tiers"],
  },
  {
    key: "statesMisc",
    defaultTitle: "States & Misc",
    groups: ["State", "Rank", "Misc"],
  },
]

// Read a dot-path (e.g. "footerColors.bg") off a Theme, falling back to the
// default so a shallow-merged partial nested object still yields a string.
const getTokenColor = (theme: Theme, path: string): string => {
  const read = (obj: unknown): unknown =>
    path
      .split(".")
      .reduce<unknown>(
        (o, k) => (o as Record<string, unknown> | null | undefined)?.[k],
        obj,
      )
  const value = read(theme)

  return typeof value === "string" ? value : (read(DEFAULT_THEME) as string)
}

// Immutably set a dot-path on a Theme, cloning every object level on the way
// down (mirrors the nested `backgrounds`/`teamColors` spread updates already in
// this file) so existing sibling keys are preserved and React sees new refs.
const setTokenColor = (theme: Theme, path: string, hex: string): Theme => {
  const keys = path.split(".")

  const assign = (
    obj: Record<string, unknown>,
    i: number,
  ): Record<string, unknown> => {
    const key = keys[i] as string

    if (i === keys.length - 1) {
      return { ...obj, [key]: hex }
    }

    const child = obj[key]

    return {
      ...obj,
      [key]: assign(
        (child && typeof child === "object" ? child : {}) as Record<
          string,
          unknown
        >,
        i + 1,
      ),
    }
  }

  return assign(
    theme as unknown as Record<string, unknown>,
    0,
  ) as unknown as Theme
}

const ConfigTheme = () => {
  const { socket } = useSocket()
  const { theme, setTheme } = useThemeStore()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const [draft, setDraft] = useState<Theme>({ ...DEFAULT_THEME, ...theme })
  // The single slot whose upload is currently in flight (one at a time).
  const [pendingSlot, setPendingSlot] = useState<ThemeSlot | null>(null)
  // The theme operation currently awaiting a server response, used to route a
  // context-free THEME_ERROR to the right handler / pending-state cleanup.
  const pendingActionRef = useRef<ThemeAction | null>(null)
  // Hidden file input for importing a template JSON (client-only round-trip).
  const templateFileInputRef = useRef<HTMLInputElement>(null)
  // Slot-scoped upload error, surfaced inline next to the slot's controls.
  const [slotErrors, setSlotErrors] = useState<
    Partial<Record<ThemeSlot, string>>
  >({})
  // Named theme presets (full ThemeTemplate[] from THEME_TEMPLATE.DATA).
  const [templates, setTemplates] = useState<ThemeTemplate[]>([])
  const [templateName, setTemplateName] = useState("")
  // The template id pending a delete confirmation; drives the AlertDialog.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const setSlotError = (slot: ThemeSlot, message: string | null) =>
    setSlotErrors((prev) => {
      if (message) {
        return { ...prev, [slot]: message }
      }

      // Drop the slot's error without a dynamic `delete`.
      return Object.fromEntries(
        Object.entries(prev).filter(([key]) => key !== slot),
      ) as Partial<Record<ThemeSlot, string>>
    })

  const preview = (next: Theme) => {
    setDraft(next)
    applyTheme(next)
  }

  // Immutably set one sound-slot override in the draft (assetRef or null). Used
  // by SoundControls for both the upload-result feedback and the reset action;
  // rides the unchanged MANAGER.SET_THEME save path (theme.sounds round-trips).
  const setSoundSlot = (slot: SoundSlot, value: string | null) =>
    setDraft((prev) => ({
      ...prev,
      sounds: { ...prev.sounds, [slot]: value },
    }))

  useEvent(EVENTS.MANAGER.BACKGROUND_UPLOADED, ({ slot, path }) => {
    pendingActionRef.current = null
    setPendingSlot((current) => (current === slot ? null : current))
    setSlotError(slot, null)
    setDraft((prev) =>
      slot === "logo"
        ? { ...prev, logo: path }
        : { ...prev, backgrounds: { ...prev.backgrounds, [slot]: path } },
    )
    toast.success(t("manager:theme.toast.imageUploaded"))
  })

  useEvent(EVENTS.MANAGER.SET_THEME_SUCCESS, (saved) => {
    pendingActionRef.current = null
    setTheme(saved)
    applyTheme(saved)
    toast.success(t("manager:theme.toast.saved"))
  })

  useEvent(EVENTS.MANAGER.THEME_ERROR, (message) => {
    // THEME_ERROR carries no slot/context. Route by the action we kicked off:
    // an upload failure attaches inline to its slot; everything else toasts.
    const action = pendingActionRef.current
    pendingActionRef.current = null

    if (action === "upload" && pendingSlot) {
      setSlotError(pendingSlot, message)
      setPendingSlot(null)

      return
    }

    toast.error(message)
  })

  // Request the saved templates once on mount.
  useEffect(() => {
    socket.emit(EVENTS.THEME_TEMPLATE.LIST)
  }, [socket])

  useEvent(EVENTS.THEME_TEMPLATE.DATA, setTemplates)

  useEvent(EVENTS.THEME_TEMPLATE.SAVE_SUCCESS, () => {
    pendingActionRef.current = null
    toast.success(t("manager:theme.templates.saved"))
    setTemplateName("")
  })

  useEvent(EVENTS.THEME_TEMPLATE.ERROR, (message) => {
    pendingActionRef.current = null
    toast.error(t(message))
  })

  // ColorPickerField hands back the hex string directly (not a change event).
  const setColorValue =
    (
      key:
        | "colorPrimary"
        | "colorSecondary"
        | "accentColor"
        | "answerTextColor",
    ) =>
    (hex: string) =>
      preview({ ...draft, [key]: hex })

  const setAnswerValue = (index: number) => (hex: string) => {
    const answerColors = [...draft.answerColors] as Theme["answerColors"]
    answerColors[index] = hex
    preview({ ...draft, answerColors })
  }

  // Registry-driven setter for a THEME_TOKENS dot-path (e.g. "tierColors.gold");
  // rides the same preview() → applyTheme() live-preview + draft path as the
  // hand-written color fields above. Saving uses the unchanged MANAGER.SET_THEME
  // flow — the full Theme draft already carries these fields.
  const setTokenValue = (path: string) => (hex: string) =>
    preview(setTokenColor(draft, path, hex))

  // AssetPreview hands back a File (its own size guard runs first); we keep a
  // defensive MAX_UPLOAD_BYTES check before streaming over the socket.
  const handleUpload = (slot: ThemeSlot) => (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setSlotError(slot, "errors:theme.imageTooLarge")

      return
    }

    setSlotError(slot, null)
    setPendingSlot(slot)
    pendingActionRef.current = "upload"

    const reader = new FileReader()
    reader.onload = () => {
      socket.emit(EVENTS.MANAGER.UPLOAD_BACKGROUND, {
        slot,
        dataUrl: reader.result as string,
      })
    }
    reader.onerror = () => {
      setSlotError(slot, "errors:theme.uploadFailed")
      setPendingSlot((current) => (current === slot ? null : current))
      pendingActionRef.current = null
    }
    reader.readAsDataURL(file)
  }

  const clearBackground = (slot: BackgroundSlot) => () =>
    setDraft((prev) => ({
      ...prev,
      backgrounds: { ...prev.backgrounds, [slot]: null },
    }))

  const handleSave = () => {
    pendingActionRef.current = "save"
    socket.emit(EVENTS.MANAGER.SET_THEME, draft)
  }
  const handleReset = () => preview({ ...DEFAULT_THEME })

  const handleSaveTemplate = () => {
    const name = templateName.trim()

    if (!name) {
      return
    }

    pendingActionRef.current = "template"
    socket.emit(EVENTS.THEME_TEMPLATE.SAVE, { name, theme: draft })
  }

  // Load a template into the editor so the admin can preview + save it.
  const handleApplyTemplate = (template: ThemeTemplate) =>
    preview({ ...DEFAULT_THEME, ...template.theme })

  // Edit a saved template: load its theme into the editable editor state and
  // prefill the name field so a re-save overwrites the same template
  // (dedupe-on-save). Same load path as Apply, but targets the name input too.
  const handleEditTemplate = (template: ThemeTemplate) => {
    preview({ ...DEFAULT_THEME, ...template.theme })
    setTemplateName(template.name)
  }

  // Export a saved template's Theme to a JSON file (client-only, no backend).
  // Mirrors the Blob/object-URL anchor pattern used by the quiz export.
  const handleExportTemplate = (template: ThemeTemplate) => {
    const slug = (s: string) =>
      s
        .normalize("NFKD")
        .replace(/[^\w-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
    const json = JSON.stringify(
      { name: template.name, theme: template.theme },
      null,
      2,
    )
    const blob = new Blob([json], { type: "application/json;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${slug(template.name) || "theme-template"}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // Import a template JSON: parse (guarded), then emit THEME_TEMPLATE.SAVE with
  // { name, theme }. The server validator rejects malformed payloads.
  const handleImportTemplate = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = (event) => {
      let data: unknown = null

      try {
        data = JSON.parse(event.target?.result as string)
      } catch {
        toast.error(
          t("manager:theme.templates.importError", {
            defaultValue: "Ungültige Vorlagen-Datei",
          }),
        )

        return
      }

      const parsed = data as { name?: unknown; theme?: unknown }
      const name =
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim()
          : file.name.replace(/\.json$/i, "")

      pendingActionRef.current = "template"
      socket.emit(EVENTS.THEME_TEMPLATE.SAVE, { name, theme: parsed.theme })
    }

    reader.onerror = () => {
      reader.abort()
      toast.error(
        t("manager:theme.templates.readError", {
          defaultValue: "Datei konnte nicht gelesen werden",
        }),
      )
    }

    reader.readAsText(file)
    e.target.value = ""
  }

  const handleDeleteTemplate = () => {
    if (!pendingDeleteId) {
      return
    }

    socket.emit(EVENTS.THEME_TEMPLATE.DELETE, { id: pendingDeleteId })
    setPendingDeleteId(null)
  }

  return (
    <>
      <motion.div
        className="flex flex-1 flex-col"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={
          reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
        }
      >
        {/* Extra bottom padding so the fixed ActionFooter never covers the last field */}
        <div className="flex flex-col gap-4 pb-20">
          {/*
          Cockpit: LEFT settings column (minmax(0,1fr)) + RIGHT sticky preview
          column (minmax(320px,420px)) at xl; single column below. The whole
          grid stays inside the ConsoleShell tabpanel scroller — no nested
          overflow that would trap mobile scroll.
        */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] xl:items-start">
            {/* ── LEFT: settings ─────────────────────────────────────── */}
            <div className="flex min-w-0 flex-col gap-6">
              {/* ── App-Titel & Beschreibung ──────────────────────────── */}
              <FormSection title={t("manager:theme.branding")}>
                <LabelRow
                  label={t("manager:theme.appTitle")}
                  htmlFor="theme-app-title"
                >
                  <Input
                    id="theme-app-title"
                    value={draft.appTitle ?? ""}
                    maxLength={40}
                    placeholder="Razzoozle"
                    variant="sm"
                    onChange={(e) =>
                      preview({ ...draft, appTitle: e.target.value || null })
                    }
                    className="min-h-11 w-full rounded-lg"
                  />
                </LabelRow>

                <LabelRow
                  label={t("manager:theme.showFooter")}
                  htmlFor="theme-show-branding"
                >
                  <input
                    id="theme-show-branding"
                    type="checkbox"
                    checked={draft.showBranding}
                    onChange={(e) =>
                      preview({ ...draft, showBranding: e.target.checked })
                    }
                    className="size-5 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                  />
                </LabelRow>

                {/* Stil / Style — Flat (Südhang) vs. Glass (Liquid-Glass).
                  Writes theme.style into the draft and live-previews via
                  preview() → applyTheme(), which sets data-theme-style on
                  <html> so the scoped glass CSS in index.css activates. */}
                <LabelRow
                  label={t("manager:theme.style.label", {
                    defaultValue: "Stil",
                  })}
                  htmlFor="theme-style-flat"
                >
                  <div
                    role="radiogroup"
                    aria-label={t("manager:theme.style.label", {
                      defaultValue: "Stil",
                    })}
                    className="inline-flex rounded-lg bg-gray-100 p-1 outline-1 -outline-offset-1 outline-gray-200"
                  >
                    {(
                      [
                        { value: "flat", fallback: "Flach" },
                        { value: "glass", fallback: "Glas" },
                      ] as const
                    ).map(({ value: styleOption, fallback }) => {
                      const active = (draft.style ?? "flat") === styleOption
                      return (
                        <button
                          id={`theme-style-${styleOption}`}
                          key={styleOption}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() =>
                            preview({ ...draft, style: styleOption })
                          }
                          className={`min-h-9 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${
                            active
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-500 hover:text-gray-700"
                          }`}
                        >
                          {t(`manager:theme.style.${styleOption}`, {
                            defaultValue: fallback,
                          })}
                        </button>
                      )
                    })}
                  </div>
                </LabelRow>
              </FormSection>

              {/* ── Farben ───────────────────────────────────────────── */}
              <FormSection
                title={t("manager:theme.uiColors")}
                description={t("manager:theme.contrastNote")}
              >
                <ColorPickerField
                  label={t("manager:theme.colors.primary")}
                  value={draft.colorPrimary}
                  onChange={setColorValue("colorPrimary")}
                />
                <ColorPickerField
                  label={t("manager:theme.colors.background")}
                  value={draft.colorSecondary}
                  onChange={setColorValue("colorSecondary")}
                />
                <ColorPickerField
                  label={t("manager:theme.colors.accent")}
                  value={draft.accentColor}
                  onChange={setColorValue("accentColor")}
                />
                <ColorPickerField
                  label={t("manager:theme.colors.text")}
                  value={draft.answerTextColor}
                  onChange={setColorValue("answerTextColor")}
                />

                {/* Answer colors — one row each */}
                {draft.answerColors.map((color, index) => {
                  const letter = ["A", "B", "C", "D"][index] ?? ""
                  return (
                    // oxlint-disable-next-line no-array-index-key
                    <ColorPickerField
                      key={index}
                      label={`${t("manager:theme.answerColors")} ${letter}`}
                      value={color}
                      onChange={setAnswerValue(index)}
                      contrastAgainst={draft.answerTextColor}
                      answerPreview={{
                        text: draft.answerTextColor,
                        label: letter,
                      }}
                    />
                  )
                })}
              </FormSection>

              {/* ── Spiel-Farben (Token-Registry) ────────────────────────
                Registry-driven pickers for every THEME_TOKENS color (teams,
                tiers, correct/wrong, rank deltas, timer, streak, muted surface,
                footer). Each binds to its dot-path in the draft; saving rides
                the unchanged MANAGER.SET_THEME flow. Defaults are a visual
                no-op, so leaving these untouched keeps the current look. */}
              {TOKEN_CARDS.map((card) => {
                const tokens = THEME_TOKENS.filter((tok) =>
                  card.groups.includes(tok.group),
                )

                if (tokens.length === 0) {
                  return null
                }

                return (
                  <SectionCard
                    key={card.key}
                    icon={
                      card.key === "teamsTiers" ? (
                        <Palette className="size-5" />
                      ) : (
                        <Sparkles className="size-5" />
                      )
                    }
                    title={t(`manager:theme.tokens.${card.key}.title`, {
                      defaultValue: card.defaultTitle,
                    })}
                    description={t(
                      `manager:theme.tokens.${card.key}.description`,
                      {
                        defaultValue: "",
                      },
                    )}
                  >
                    {tokens.map((tok) => (
                      <ColorPickerField
                        key={tok.path}
                        label={t(`manager:theme.tokens.fields.${tok.path}`, {
                          defaultValue: tok.label,
                        })}
                        value={getTokenColor(draft, tok.path)}
                        onChange={setTokenValue(tok.path)}
                      />
                    ))}
                  </SectionCard>
                )
              })}

              {/* ── Animation (spring/duration/stagger + live preview) ──
                Tunes draft.animation; the live preview re-reveals with the draft
                tokens via useReveal(draft.animation). Saving rides the unchanged
                MANAGER.SET_THEME flow — the full draft carries these fields. */}
              <AnimationControls
                value={draft.animation}
                onChange={(animation) => preview({ ...draft, animation })}
              />

              {/* ── Animierter Hintergrund (per-slot type + speed/intensity/iconCount) ──
                Edits draft.backgrounds.animated; the live preview reflects the
                auth-slot config. Saving rides the unchanged MANAGER.SET_THEME flow. */}
              <AnimatedBackgroundControls
                value={
                  draft.backgrounds.animated ??
                  DEFAULT_THEME.backgrounds.animated
                }
                onChange={(animated) =>
                  preview({
                    ...draft,
                    backgrounds: { ...draft.backgrounds, animated },
                  })
                }
              />

              {/* ── Logo ─────────────────────────────────────────────── */}
              <FormSection title={t("manager:theme.logo")}>
                <AssetPreview
                  label={t("manager:theme.logo")}
                  value={draft.logo ?? null}
                  fit="contain"
                  aspect="aspect-video"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  uploading={pendingSlot === "logo"}
                  error={slotErrors.logo ? t(slotErrors.logo) : undefined}
                  onUpload={handleUpload("logo")}
                  onReset={() => setDraft((p) => ({ ...p, logo: null }))}
                  defaultLabel={t("manager:theme.default")}
                />
              </FormSection>

              {/* ── Hintergründe ─────────────────────────────────────── */}
              <SectionCard
                icon={<ImageIcon className="size-5" />}
                title={t("manager:theme.backgrounds")}
              >
                <LabelRow
                  label={t("manager:theme.scrim", { value: draft.scrim })}
                  htmlFor="theme-scrim"
                >
                  <input
                    id="theme-scrim"
                    type="range"
                    min={0}
                    max={100}
                    value={draft.scrim}
                    onChange={(e) =>
                      preview({ ...draft, scrim: Number(e.target.value) })
                    }
                    className="h-11 w-full cursor-pointer accent-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                  />
                </LabelRow>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {BG_SLOTS.map(({ key, labelKey, aspect }) => (
                    <AssetPreviewCard
                      key={key}
                      label={t(labelKey)}
                      value={draft.backgrounds[key] ?? null}
                      fit="cover"
                      aspect={aspect}
                      scrim={draft.scrim}
                      accept="image/png,image/jpeg,image/webp"
                      uploading={pendingSlot === key}
                      error={
                        slotErrors[key]
                          ? t(slotErrors[key] as string)
                          : undefined
                      }
                      onUpload={handleUpload(key)}
                      onReset={clearBackground(key)}
                      defaultLabel={t("manager:theme.default")}
                    />
                  ))}
                </div>
              </SectionCard>

              {/* ── Sounds (per-slot upload / test / reset) ────────────
                Bound to draft.sounds; uploads emit MANAGER.UPLOAD_SOUND and the
                MANAGER.SOUND_UPLOADED ack feeds the served assetRef back into
                the draft. Saving rides the unchanged MANAGER.SET_THEME flow. */}
              <SoundControls draft={draft} onSlotChange={setSoundSlot} />

              {/* ── Vorlagen ─────────────────────────────────────────── */}
              <SectionCard
                icon={<BookMarked className="size-5" />}
                title={t("manager:theme.templates.title")}
              >
                <SubGroup>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={templateName}
                      maxLength={60}
                      placeholder={t("manager:theme.templates.namePrompt")}
                      variant="sm"
                      aria-label={t("manager:theme.templates.namePrompt")}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="min-h-11 flex-1 rounded-lg"
                    />
                    <Button
                      variant="primary"
                      type="button"
                      onClick={handleSaveTemplate}
                      disabled={!templateName.trim()}
                    >
                      {t("manager:theme.templates.save")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      type="button"
                      onClick={() => templateFileInputRef.current?.click()}
                      title={t("manager:theme.templates.import", {
                        defaultValue: "Vorlage importieren",
                      })}
                      aria-label={t("manager:theme.templates.import", {
                        defaultValue: "Vorlage importieren",
                      })}
                    >
                      <Upload className="size-4" aria-hidden />
                    </Button>
                    <input
                      ref={templateFileInputRef}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={handleImportTemplate}
                    />
                  </div>
                </SubGroup>

                {templates.length === 0 ? (
                  <EmptyState
                    icon={BookMarked}
                    headline={t("manager:theme.templates.emptyHeadline")}
                    hint={t("manager:theme.templates.none")}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="flex flex-col gap-3 rounded-xl bg-gray-50 p-3 outline-1 -outline-offset-1 outline-gray-200"
                      >
                        <p className="min-w-0 truncate text-sm font-semibold text-gray-700">
                          {template.name}
                        </p>
                        <div className="flex h-6 overflow-hidden rounded-md outline-1 -outline-offset-1 outline-gray-200">
                          {[
                            template.theme.colorPrimary,
                            template.theme.accentColor,
                            ...template.theme.answerColors,
                          ].map((color, index) => (
                            <span
                              // oxlint-disable-next-line no-array-index-key
                              key={index}
                              className="flex-1"
                              style={{ backgroundColor: color }}
                              aria-hidden
                            />
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            onClick={() => handleApplyTemplate(template)}
                          >
                            {t("manager:theme.templates.apply")}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            onClick={() => handleEditTemplate(template)}
                          >
                            {t("manager:theme.templates.edit", {
                              defaultValue: "Bearbeiten",
                            })}
                          </Button>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              size="icon"
                              type="button"
                              aria-label={t("manager:theme.templates.export", {
                                defaultValue: "Vorlage exportieren",
                              })}
                              title={t("manager:theme.templates.export", {
                                defaultValue: "Vorlage exportieren",
                              })}
                              onClick={() => handleExportTemplate(template)}
                            >
                              <Download className="size-4" aria-hidden />
                            </Button>
                            <Button
                              variant="danger"
                              size="icon"
                              type="button"
                              aria-label={t("manager:theme.templates.delete")}
                              title={t("manager:theme.templates.delete")}
                              onClick={() => setPendingDeleteId(template.id)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            {/* ── RIGHT: live preview (sticky) ───────────────────────── */}
            <div className="xl:sticky xl:top-4">
              <ThemePreviewPanel theme={draft} />
            </div>
          </div>

          {/* Skeleton transfer / custom CSS+JS / reset — integrated here so all
            theming lives under the Design tab (no separate Skeleton tab). */}
          <ConfigSkeleton />
        </div>
      </motion.div>

      <ActionFooter>
        <Button
          variant="secondary"
          type="button"
          onClick={handleReset}
          className="rounded-xl"
        >
          <RotateCcw className="size-4" aria-hidden />
          {t("manager:theme.reset")}
        </Button>
        <Button
          variant="primary"
          className="flex-1 rounded-xl sm:flex-none"
          onClick={handleSave}
        >
          {t("manager:theme.save")}
        </Button>
      </ActionFooter>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null)
          }
        }}
        title={t("manager:theme.templates.delete")}
        description={t("manager:theme.templates.deleteConfirm", {
          name: templates.find((tpl) => tpl.id === pendingDeleteId)?.name ?? "",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleDeleteTemplate}
      />
    </>
  )
}

export default ConfigTheme
