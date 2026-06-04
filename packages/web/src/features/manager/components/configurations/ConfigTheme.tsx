import {
  type BackgroundSlot,
  EVENTS,
  type ThemeSlot,
} from "@razzia/common/constants"
import { DEFAULT_THEME, type Theme } from "@razzia/common/types/theme"
import Button from "@razzia/web/components/Button"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { applyTheme } from "@razzia/web/features/theme/apply"
import { useThemeStore } from "@razzia/web/features/theme/store"
import { LoaderCircle } from "lucide-react"
import { useState } from "react"
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

const ConfigTheme = () => {
  const { socket } = useSocket()
  const { theme, setTheme } = useThemeStore()
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Theme>({ ...DEFAULT_THEME, ...theme })
  // The single slot whose upload is currently in flight (one at a time).
  const [pendingSlot, setPendingSlot] = useState<ThemeSlot | null>(null)
  // Slot-scoped upload error, surfaced inline next to the slot's controls.
  const [slotErrors, setSlotErrors] = useState<Partial<Record<ThemeSlot, string>>>(
    {},
  )

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
    (key: "colorPrimary" | "colorSecondary" | "accentColor" | "answerTextColor") =>
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

  const colorField = (
    label: string,
    value: string,
    onChange: (_e: React.ChangeEvent<HTMLInputElement>) => void,
  ) => (
    <label className="flex flex-col items-center gap-1 text-xs text-gray-500">
      <input
        type="color"
        value={value}
        onChange={onChange}
        className="size-10 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
      {label}
      <span className="font-mono text-[10px] tracking-tight text-gray-400 uppercase tabular-nums">
        {value}
      </span>
    </label>
  )

  const uploadButton = (slot: ThemeSlot, accept: string) => {
    const uploading = pendingSlot === slot

    return (
      <label
        aria-disabled={uploading}
        className={
          uploading
            ? "bg-primary/60 flex cursor-not-allowed items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white"
            : "bg-primary flex cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white"
        }
      >
        {uploading && (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        )}
        {t("manager:theme.upload")}
        <input
          type="file"
          accept={accept}
          className="hidden"
          disabled={uploading}
          onChange={handleUpload(slot)}
        />
      </label>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          {t("manager:theme.branding")}
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            {t("manager:theme.appTitle")}
            <input
              value={draft.appTitle ?? ""}
              maxLength={40}
              placeholder="Razzia"
              onChange={(e) =>
                preview({ ...draft, appTitle: e.target.value || null })
              }
              className="rounded-lg border border-gray-200 px-2 py-1 text-gray-800 outline-none"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-gray-700">
                {t("manager:theme.logo")}
              </p>
              <p className="truncate text-xs text-gray-400">
                {draft.logo ?? t("manager:theme.default")}
              </p>
              {slotErrors.logo && (
                <p className="truncate text-xs text-red-500" role="alert">
                  {t(slotErrors.logo)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {uploadButton("logo", "image/png,image/jpeg,image/webp,image/svg+xml")}
              {draft.logo && (
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, logo: null }))}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100"
                >
                  {t("manager:theme.default")}
                </button>
              )}
            </div>
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gray-600">
            <input
              type="checkbox"
              checked={draft.showBranding}
              onChange={(e) =>
                preview({ ...draft, showBranding: e.target.checked })
              }
              className="size-4 cursor-pointer"
            />
            {t("manager:theme.showFooter")}
          </label>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          {t("manager:theme.uiColors")}
        </p>
        <div className="flex gap-4">
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
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          {t("manager:theme.answerColors")}
        </p>
        <div className="flex flex-wrap items-end gap-4">
          {draft.answerColors.map((color, index) => (
            // oxlint-disable-next-line no-array-index-key
            <div key={index}>
              {colorField(["A", "B", "C", "D"][index] ?? "", color, setAnswer(index))}
            </div>
          ))}
          {colorField(
            t("manager:theme.colors.text"),
            draft.answerTextColor,
            setColor("answerTextColor"),
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          {t("manager:theme.scrim", { value: draft.scrim })}
        </p>
        <input
          type="range"
          min={0}
          max={100}
          value={draft.scrim}
          onChange={(e) => preview({ ...draft, scrim: Number(e.target.value) })}
          className="accent-primary w-full cursor-pointer"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          {t("manager:theme.backgrounds")}
        </p>
        <div className="flex flex-col gap-3">
          {BG_SLOTS.map(({ key, labelKey }) => {
            const slotError = slotErrors[key]

            return (
            <div key={key} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-700">{t(labelKey)}</p>
                <p className="truncate text-xs text-gray-400">
                  {draft.backgrounds[key] ?? t("manager:theme.default")}
                </p>
                {slotError && (
                  <p className="truncate text-xs text-red-500" role="alert">
                    {t(slotError)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {uploadButton(key, "image/png,image/jpeg,image/webp")}
                {draft.backgrounds[key] && (
                  <button
                    type="button"
                    onClick={clearBackground(key)}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100"
                  >
                    {t("manager:theme.default")}
                  </button>
                )}
              </div>
            </div>
            )
          })}
        </div>
      </div>

      <div className="mt-auto flex gap-2 pt-2">
        <Button className="bg-primary flex-1 text-white" onClick={handleSave}>
          {t("manager:theme.save")}
        </Button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-gray-200 px-4 text-sm font-semibold text-gray-500 hover:bg-gray-100"
        >
          {t("manager:theme.reset")}
        </button>
      </div>
    </div>
  )
}

export default ConfigTheme
