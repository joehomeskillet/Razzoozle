import {
  type BackgroundSlot,
  EVENTS,
  type ThemeSlot,
} from "@razzia/common/constants"
import { DEFAULT_THEME, type Theme } from "@razzia/common/types/theme"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { Field } from "@razzia/web/features/manager/components/console"
import { applyTheme } from "@razzia/web/features/theme/apply"
import { useThemeStore } from "@razzia/web/features/theme/store"
import { LoaderCircle, RotateCcw, Upload } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type ReactNode, useState } from "react"
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

// Upload-label class set, split out to keep the JSX tidy.
const clsxUpload = (uploading: boolean) =>
  [
    "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white transition-colors",
    "bg-[var(--accent-contrast)] hover:brightness-105",
    "focus-within:outline-[var(--color-primary)] focus-within:outline-2 focus-within:outline-offset-2",
    uploading && "cursor-not-allowed opacity-70",
  ]
    .filter(Boolean)
    .join(" ")

// A labelled section grouping related controls into one card (spec §5 "Dense").
const Section = ({
  legend,
  children,
}: {
  legend: string
  children: ReactNode
}) => (
  <fieldset className="flex flex-col gap-4 rounded-xl bg-gray-50 p-4">
    <legend className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
      {legend}
    </legend>
    {children}
  </fieldset>
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
      <span className="font-mono text-[10px] tracking-tight text-gray-400 uppercase tabular-nums">
        {value}
      </span>
    </label>
  )

  // Real <label>-wrapped file picker (spec §6: native control, not a fake button).
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
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
    >
      {t("manager:theme.default")}
    </button>
  )

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col"
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
      }
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto overscroll-contain p-0.5 lg:grid-cols-2">
        {/* ── Branding ─────────────────────────────────────────────── */}
        <Section legend={t("manager:theme.branding")}>
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

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                {t("manager:theme.logo")}
              </p>
              <p className="truncate text-sm text-gray-500">
                {draft.logo ?? t("manager:theme.default")}
              </p>
              {slotErrors.logo && (
                <p
                  className="truncate text-sm font-semibold text-red-600"
                  role="alert"
                >
                  {t(slotErrors.logo)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {uploadButton(
                "logo",
                "image/png,image/jpeg,image/webp,image/svg+xml",
              )}
              {draft.logo &&
                resetSlotButton(() => setDraft((p) => ({ ...p, logo: null })))}
            </div>
          </div>

          <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gray-600">
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
        </Section>

        {/* ── UI-Farben ────────────────────────────────────────────── */}
        <Section legend={t("manager:theme.uiColors")}>
          <div className="flex flex-wrap gap-4">
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
          <p className="text-sm text-gray-500">
            {t("manager:theme.contrastNote")}
          </p>
        </Section>

        {/* ── Antwort-Farben ───────────────────────────────────────── */}
        <Section legend={t("manager:theme.answerColors")}>
          <div className="flex flex-wrap items-end gap-4">
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
        </Section>

        {/* ── Hintergründe ─────────────────────────────────────────── */}
        <Section legend={t("manager:theme.backgrounds")}>
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
            {BG_SLOTS.map(({ key, labelKey }) => {
              const slotError = slotErrors[key]

              return (
                <div key={key} className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                      {t(labelKey)}
                    </p>
                    <p className="truncate text-sm text-gray-500">
                      {draft.backgrounds[key] ?? t("manager:theme.default")}
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
                    {uploadButton(key, "image/png,image/jpeg,image/webp")}
                    {draft.backgrounds[key] &&
                      resetSlotButton(clearBackground(key))}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      </div>

      <div className="mt-4 flex shrink-0 gap-2 border-t border-gray-200 pt-4">
        <Button className="min-h-11 flex-1 rounded-xl" onClick={handleSave}>
          {t("manager:theme.save")}
        </Button>
        <button
          type="button"
          onClick={handleReset}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          <RotateCcw className="size-4" aria-hidden />
          {t("manager:theme.reset")}
        </button>
      </div>
    </motion.div>
  )
}

export default ConfigTheme
