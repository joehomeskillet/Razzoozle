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
import {
  AssetPreview,
  AssetPreviewCard,
  ColorSwatchField,
  EmptyState,
  Field,
  SectionCard,
  StickyActions,
  SubGroup,
} from "@razzia/web/features/manager/components/console"
import ThemePreviewPanel from "@razzia/web/features/manager/components/configurations/theme-preview/ThemePreviewPanel"
import { applyTheme } from "@razzia/web/features/theme/apply"
import { useThemeStore } from "@razzia/web/features/theme/store"
import {
  BookMarked,
  Image as ImageIcon,
  Palette,
  RotateCcw,
  SwatchBook,
  Trash2,
  Type,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Match the server's hard cap in saveBackgroundImage so we reject oversized
// files client-side before pushing megabytes over the socket. AssetPreview
// also guards client-side; this stays as a second line of defence.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

const BG_SLOTS: Array<{
  key: BackgroundSlot
  labelKey: string
  aspect: string
}> = [
  { key: "auth", labelKey: "manager:theme.bgSlots.auth", aspect: "aspect-[16/10]" },
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

  // ColorSwatch hands back the hex string directly (not a change event).
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

  // AssetPreview hands back a File (its own size guard runs first); we keep a
  // defensive MAX_UPLOAD_BYTES check before streaming over the socket.
  const handleUpload = (slot: ThemeSlot) => (file: File) => {
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

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col"
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
      }
    >
      <div className="flex flex-col gap-4 pb-20">
        {/*
          Cockpit: LEFT settings column (minmax(0,1fr)) + RIGHT sticky preview
          column (minmax(320px,420px)) at xl; single column below. The whole
          grid stays inside the ConsoleShell tabpanel scroller — no nested
          overflow that would trap mobile scroll.
        */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] xl:items-start">
          {/* ── LEFT: settings ─────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* ── Branding ─────────────────────────────────────────── */}
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

              <SubGroup>
                <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
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
              </SubGroup>
            </SectionCard>

            {/* ── UI-Farben ────────────────────────────────────────── */}
            <SectionCard
              icon={<Palette className="size-5" />}
              title={t("manager:theme.uiColors")}
              description={t("manager:theme.contrastNote")}
            >
              <SubGroup>
                <div className="flex flex-wrap items-start justify-center gap-4 sm:justify-start">
                  <ColorSwatchField
                    label={t("manager:theme.colors.primary")}
                    value={draft.colorPrimary}
                    contrastAgainst="#ffffff"
                    onChange={setColorValue("colorPrimary")}
                  />
                  <ColorSwatchField
                    label={t("manager:theme.colors.background")}
                    value={draft.colorSecondary}
                    onChange={setColorValue("colorSecondary")}
                  />
                  <ColorSwatchField
                    label={t("manager:theme.colors.accent")}
                    value={draft.accentColor}
                    contrastAgainst="#ffffff"
                    onChange={setColorValue("accentColor")}
                  />
                </div>
              </SubGroup>
            </SectionCard>

            {/* ── Antwort-Farben ───────────────────────────────────── */}
            <SectionCard
              icon={<Type className="size-5" />}
              title={t("manager:theme.answerColors")}
            >
              <SubGroup>
                <div className="flex flex-wrap items-start justify-center gap-4 sm:justify-start">
                  {draft.answerColors.map((color, index) => (
                    // oxlint-disable-next-line no-array-index-key
                    <ColorSwatchField
                      key={index}
                      label={["A", "B", "C", "D"][index] ?? ""}
                      value={color}
                      contrastAgainst={draft.answerTextColor}
                      answerPreview={{
                        text: draft.answerTextColor,
                        label: ["A", "B", "C", "D"][index] ?? "",
                      }}
                      onChange={setAnswerValue(index)}
                    />
                  ))}
                </div>
              </SubGroup>

              <SubGroup>
                <div className="flex justify-center sm:justify-start">
                  <ColorSwatchField
                    label={t("manager:theme.colors.text")}
                    value={draft.answerTextColor}
                    onChange={setColorValue("answerTextColor")}
                  />
                </div>
              </SubGroup>
            </SectionCard>

            {/* ── Hintergründe ─────────────────────────────────────── */}
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
                      slotErrors[key] ? t(slotErrors[key] as string) : undefined
                    }
                    onUpload={handleUpload(key)}
                    onReset={clearBackground(key)}
                    defaultLabel={t("manager:theme.default")}
                  />
                ))}
              </div>
            </SectionCard>

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

        <StickyActions>
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
        </StickyActions>
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
    </motion.div>
  )
}

export default ConfigTheme
