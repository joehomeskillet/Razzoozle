import {
  type BackgroundSlot,
  EVENTS,
  type ThemeSlot,
} from "@razzia/common/constants"
import {
  DEFAULT_THEME,
  type Theme,
  type ThemeTemplate,
} from "@razzia/common/types/theme"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { Field } from "@razzia/web/features/manager/components/console"
import { applyTheme } from "@razzia/web/features/theme/apply"
import { useThemeStore } from "@razzia/web/features/theme/store"
import {
  BookMarked,
  Image as ImageIcon,
  LoaderCircle,
  Palette,
  RotateCcw,
  SwatchBook,
  Trash2,
  Type,
  Upload,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type ReactNode, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Match the server's hard cap in saveBackgroundImage so we reject oversized
// files client-side before pushing megabytes over the socket.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

const BG_SLOTS: Array<{ key: BackgroundSlot; labelKey: string }> = [
  { key: "auth", labelKey: "manager:theme.bgSlots.auth" },
  { key: "managerGame", labelKey: "manager:theme.bgSlots.managerGame" },
  { key: "playerGame", labelKey: "manager:theme.bgSlots.playerGame" },
]

// Upload-label class set, split out to keep the JSX tidy. Mirrors the shared
// <Button variant="primary"> surface (accent-contrast clears AA on white).
const clsxUpload = (uploading: boolean) =>
  [
    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-white shadow-sm transition-colors",
    "bg-[var(--accent-contrast)] hover:brightness-[1.05] active:brightness-[0.95]",
    "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white",
    uploading && "cursor-not-allowed opacity-60",
  ]
    .filter(Boolean)
    .join(" ")

// A titled section card matching ConfigAI/ConfigCatalog: white panel, gray
// outline, header (icon + title + optional description). Sunken bg-gray-50
// surfaces live inside via SubGroup.
const SectionCard = ({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description?: string
  children: ReactNode
}) => (
  <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm outline-2 -outline-offset-2 outline-gray-200">
    <div className="flex items-start gap-2.5">
      <span
        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-tint)] text-[var(--accent-contrast)]"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500">{description}</p>
        )}
      </div>
    </div>
    {children}
  </section>
)

// A sunken sub-surface for grouping related controls inside a card.
const SubGroup = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl bg-gray-50 p-3 outline-1 -outline-offset-1 outline-gray-200">
    {children}
  </div>
)

const ConfigTheme = () => {
  const { socket } = useSocket()
  const { theme, setTheme } = useThemeStore()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const [draft, setDraft] = useState<Theme>({ ...DEFAULT_THEME, ...theme })
  // The single slot whose upload is currently in flight (one at a time).
  const [pendingSlot, setPendingSlot] = useState<ThemeSlot | null>(null)
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

  useEvent(EVENTS.MANAGER.BACKGROUND_UPLOADED, ({ slot, path }) => {
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
    setTheme(saved)
    applyTheme(saved)
    toast.success(t("manager:theme.toast.saved"))
  })

  useEvent(EVENTS.MANAGER.THEME_ERROR, (message) => {
    // THEME_ERROR carries no slot. If an upload is in flight, attribute the
    // failure to that slot inline; otherwise it's a save error → toast.
    if (pendingSlot) {
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
    toast.success(t("manager:theme.templates.saved"))
    setTemplateName("")
  })

  useEvent(EVENTS.THEME_TEMPLATE.ERROR, (message) => {
    toast.error(t(message))
  })

  const preview = (next: Theme) => {
    setDraft(next)
    applyTheme(next)
  }

  const setColor =
    (
      key:
        | "colorPrimary"
        | "colorSecondary"
        | "accentColor"
        | "answerTextColor",
    ) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      preview({ ...draft, [key]: e.target.value })

  const setAnswer =
    (index: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const answerColors = [...draft.answerColors] as Theme["answerColors"]
      answerColors[index] = e.target.value
      preview({ ...draft, answerColors })
    }

  const handleUpload =
    (slot: ThemeSlot) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // Allow re-selecting the same file after an error.
      e.target.value = ""

      if (!file) {
        return
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        setSlotError(slot, "errors:theme.imageTooLarge")

        return
      }

      setSlotError(slot, null)
      setPendingSlot(slot)

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
      }
      reader.readAsDataURL(file)
    }

  const clearBackground = (slot: BackgroundSlot) => () =>
    setDraft((prev) => ({
      ...prev,
      backgrounds: { ...prev.backgrounds, [slot]: null },
    }))

  const handleSave = () => socket.emit(EVENTS.MANAGER.SET_THEME, draft)
  const handleReset = () => preview({ ...DEFAULT_THEME })

  const handleSaveTemplate = () => {
    const name = templateName.trim()

    if (!name) {
      return
    }

    socket.emit(EVENTS.THEME_TEMPLATE.SAVE, { name, theme: draft })
  }

  // Load a template into the editor so the admin can preview + save it.
  const handleApplyTemplate = (template: ThemeTemplate) =>
    preview({ ...DEFAULT_THEME, ...template.theme })

  const handleDeleteTemplate = () => {
    if (!pendingDeleteId) {
      return
    }

    socket.emit(EVENTS.THEME_TEMPLATE.DELETE, { id: pendingDeleteId })
    setPendingDeleteId(null)
  }

  // One color swatch + label + hex readout, focus-ringed.
  const colorField = (
    label: string,
    value: string,
    onChange: (_e: React.ChangeEvent<HTMLInputElement>) => void,
  ) => (
    <label className="flex flex-col items-center gap-1 text-center text-xs font-medium text-gray-600">
      <input
        type="color"
        value={value}
        onChange={onChange}
        aria-label={label}
        className="size-11 cursor-pointer rounded-lg border border-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
      />
      {label}
      <span className="font-mono text-xs tracking-tight text-gray-500 uppercase tabular-nums">
        {value}
      </span>
    </label>
  )

  // Real <label>-wrapped file picker (native control, not a fake button).
  const uploadButton = (slot: ThemeSlot, accept: string) => {
    const uploading = pendingSlot === slot

    return (
      <label aria-disabled={uploading} className={clsxUpload(uploading)}>
        {uploading ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="size-4" aria-hidden="true" />
        )}
        {t("manager:theme.upload")}
        <input
          type="file"
          accept={accept}
          className="sr-only"
          disabled={uploading}
          onChange={handleUpload(slot)}
        />
      </label>
    )
  }

  // A "back to default" secondary action shared by logo + background slots.
  const resetSlotButton = (onClick: () => void) => (
    <Button variant="secondary" size="sm" type="button" onClick={onClick}>
      {t("manager:theme.default")}
    </Button>
  )

  // One asset row (logo / background slot): name + status + upload + reset.
  const assetRow = ({
    slot,
    label,
    value,
    accept,
    onReset,
  }: {
    slot: ThemeSlot
    label: string
    value: string | null | undefined
    accept: string
    onReset: () => void
  }) => {
    const slotError = slotErrors[slot]

    return (
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {label}
          </p>
          <p className="truncate text-sm text-gray-500">
            {value ?? t("manager:theme.default")}
          </p>
          {slotError && (
            <p
              className="truncate text-sm font-semibold text-red-600"
              role="alert"
            >
              {t(slotError)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {uploadButton(slot, accept)}
          {value && resetSlotButton(onReset)}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col bg-gray-50"
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-6">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("manager:theme.branding")}
          </h2>
          <p className="text-sm text-gray-500">
            {t("manager:theme.contrastNote")}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
          {/* ── Branding ───────────────────────────────────────────── */}
          <SectionCard
            icon={<SwatchBook className="size-5" />}
            title={t("manager:theme.branding")}
          >
            <Field label={t("manager:theme.appTitle")}>
              <Input
                value={draft.appTitle ?? ""}
                maxLength={40}
                placeholder="Razzia"
                variant="sm"
                onChange={(e) =>
                  preview({ ...draft, appTitle: e.target.value || null })
                }
                className="min-h-11 w-full rounded-lg"
              />
            </Field>

            <SubGroup>
              {assetRow({
                slot: "logo",
                label: t("manager:theme.logo"),
                value: draft.logo,
                accept: "image/png,image/jpeg,image/webp,image/svg+xml",
                onReset: () => setDraft((p) => ({ ...p, logo: null })),
              })}
            </SubGroup>

            <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={draft.showBranding}
                onChange={(e) =>
                  preview({ ...draft, showBranding: e.target.checked })
                }
                className="size-5 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              />
              {t("manager:theme.showFooter")}
            </label>
          </SectionCard>

          {/* ── UI-Farben ──────────────────────────────────────────── */}
          <SectionCard
            icon={<Palette className="size-5" />}
            title={t("manager:theme.uiColors")}
            description={t("manager:theme.contrastNote")}
          >
            <SubGroup>
              <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
                {colorField(
                  t("manager:theme.colors.primary"),
                  draft.colorPrimary,
                  setColor("colorPrimary"),
                )}
                {colorField(
                  t("manager:theme.colors.background"),
                  draft.colorSecondary,
                  setColor("colorSecondary"),
                )}
                {colorField(
                  t("manager:theme.colors.accent"),
                  draft.accentColor,
                  setColor("accentColor"),
                )}
              </div>
            </SubGroup>
          </SectionCard>

          {/* ── Antwort-Farben ─────────────────────────────────────── */}
          <SectionCard
            icon={<Type className="size-5" />}
            title={t("manager:theme.answerColors")}
          >
            <SubGroup>
              <div className="flex flex-wrap items-end justify-center gap-4 sm:justify-start">
                {draft.answerColors.map((color, index) => (
                  // oxlint-disable-next-line no-array-index-key
                  <div key={index}>
                    {colorField(
                      ["A", "B", "C", "D"][index] ?? "",
                      color,
                      setAnswer(index),
                    )}
                  </div>
                ))}
                {colorField(
                  t("manager:theme.colors.text"),
                  draft.answerTextColor,
                  setColor("answerTextColor"),
                )}
              </div>
            </SubGroup>
          </SectionCard>

          {/* ── Hintergründe ───────────────────────────────────────── */}
          <SectionCard
            icon={<ImageIcon className="size-5" />}
            title={t("manager:theme.backgrounds")}
          >
            <Field
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
            </Field>

            <div className="flex flex-col gap-3">
              {BG_SLOTS.map(({ key, labelKey }) => (
                <SubGroup key={key}>
                  {assetRow({
                    slot: key,
                    label: t(labelKey),
                    value: draft.backgrounds[key],
                    accept: "image/png,image/jpeg,image/webp",
                    onReset: clearBackground(key),
                  })}
                </SubGroup>
              ))}
            </div>
          </SectionCard>

          {/* ── Vorlagen ───────────────────────────────────────────── */}
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
              </div>
            </SubGroup>

            {templates.length === 0 ? (
              <p className="text-sm text-gray-500">
                {t("manager:theme.templates.none")}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {templates.map((template) => (
                  <SubGroup key={template.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-gray-700">
                        {template.name}
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() => handleApplyTemplate(template)}
                        >
                          {t("manager:theme.templates.apply")}
                        </Button>
                        <Button
                          variant="danger"
                          size="icon"
                          type="button"
                          aria-label={t("manager:theme.templates.delete")}
                          onClick={() => setPendingDeleteId(template.id)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </SubGroup>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null)
          }
        }}
        title={t("manager:theme.templates.delete")}
        description={t("manager:theme.templates.deleteConfirm", {
          name:
            templates.find((tpl) => tpl.id === pendingDeleteId)?.name ?? "",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleDeleteTemplate}
      />

      <div className="flex shrink-0 gap-2 border-t border-gray-200 bg-white p-4">
        <Button
          variant="primary"
          className="flex-1 rounded-xl"
          onClick={handleSave}
        >
          {t("manager:theme.save")}
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={handleReset}
          className="rounded-xl"
        >
          <RotateCcw className="size-4" aria-hidden />
          {t("manager:theme.reset")}
        </Button>
      </div>
    </motion.div>
  )
}

export default ConfigTheme
