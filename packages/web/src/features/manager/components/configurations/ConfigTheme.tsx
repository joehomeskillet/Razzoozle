import {
  type BackgroundSlot,
  EVENTS,
  type ThemeSlot,
} from "@razzoozle/common/constants"
import {
  DEFAULT_THEME,
  type Theme,
  type ThemeRevision,
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
import ThemePreviewPanel from "@razzoozle/web/features/manager/components/configurations/theme-preview/ThemePreviewPanel"
import { applyTheme } from "@razzoozle/web/features/theme/apply"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import {
  BookMarked,
  History,
  Image as ImageIcon,
  RotateCcw,
  Trash2,
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

// Locale-aware short timestamp for a saved revision (mirrors ConfigMedia).
const formatRevisionDate = (iso: string) => {
  const d = new Date(iso)

  return `${d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} · ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

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
  // Per-save theme revisions (full ThemeRevision[] from THEME_REVISION.DATA).
  const [revisions, setRevisions] = useState<ThemeRevision[]>([])
  // The revision id pending a restore confirmation; drives the AlertDialog.
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null)

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

  // Request the saved templates + revisions once on mount.
  useEffect(() => {
    socket.emit(EVENTS.THEME_TEMPLATE.LIST)
    socket.emit(EVENTS.THEME_REVISION.LIST_REVISIONS)
  }, [socket])

  useEvent(EVENTS.THEME_TEMPLATE.DATA, setTemplates)

  useEvent(EVENTS.THEME_TEMPLATE.SAVE_SUCCESS, () => {
    toast.success(t("manager:theme.templates.saved"))
    setTemplateName("")
  })

  useEvent(EVENTS.THEME_TEMPLATE.ERROR, (message) => {
    toast.error(t(message))
  })

  useEvent(EVENTS.THEME_REVISION.DATA, setRevisions)

  // RESTORE_SUCCESS carries the restored Theme — sync the shared store AND
  // preview it (mirrors SET_THEME_SUCCESS). The acting socket is excluded from
  // the server's THEME broadcast, so without updating the store here a later tab
  // remount would re-seed `draft` from the stale store and a Save would clobber
  // the restored theme.
  useEvent(EVENTS.THEME_REVISION.RESTORE_SUCCESS, (restored) => {
    const full = { ...DEFAULT_THEME, ...restored }
    setTheme(full)
    preview(full)
    toast.success(t("manager:theme.revisions.restored"))
  })

  useEvent(EVENTS.THEME_REVISION.ERROR, (message) => {
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

  // Restore a captured revision. The server snapshots the current theme first
  // (restore is undoable) and broadcasts THEME; RESTORE_SUCCESS triggers the
  // local preview() above.
  const handleRestore = () => {
    if (!pendingRestoreId) {
      return
    }

    socket.emit(EVENTS.THEME_REVISION.RESTORE_REVISION, { id: pendingRestoreId })
    setPendingRestoreId(null)
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

              <LabelRow label={t("manager:theme.showFooter")} htmlFor="theme-show-branding">
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
                label={t("manager:theme.style.label", { defaultValue: "Stil" })}
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
                        onClick={() => preview({ ...draft, style: styleOption })}
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
                    answerPreview={{ text: draft.answerTextColor, label: letter }}
                  />
                )
              })}
            </FormSection>

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

            {/* ── Versionen ────────────────────────────────────────── */}
            <SectionCard
              icon={<History className="size-5" />}
              title={t("manager:theme.revisions.title")}
            >
              {revisions.length === 0 ? (
                <EmptyState
                  icon={History}
                  headline={t("manager:theme.revisions.empty")}
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {revisions.map((revision) => (
                    <div
                      key={revision.id}
                      className="flex flex-col gap-3 rounded-xl bg-gray-50 p-3 outline-1 -outline-offset-1 outline-gray-200"
                    >
                      <p className="min-w-0 truncate text-sm font-semibold text-gray-700">
                        {t("manager:theme.revisions.savedAt", {
                          when: formatRevisionDate(revision.createdAt),
                        })}
                      </p>
                      <div className="flex h-6 overflow-hidden rounded-md outline-1 -outline-offset-1 outline-gray-200">
                        {[
                          revision.theme.colorPrimary,
                          revision.theme.accentColor,
                          ...revision.theme.answerColors,
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
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => setPendingRestoreId(revision.id)}
                      >
                        {t("manager:theme.revisions.restore")}
                      </Button>
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
          name:
            templates.find((tpl) => tpl.id === pendingDeleteId)?.name ?? "",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleDeleteTemplate}
      />

      <AlertDialog
        open={pendingRestoreId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRestoreId(null)
          }
        }}
        title={t("manager:theme.revisions.restore")}
        description={t("manager:theme.revisions.confirmRestore")}
        confirmLabel={t("manager:theme.revisions.restore")}
        onConfirm={handleRestore}
      />
    </>
  )
}

export default ConfigTheme
