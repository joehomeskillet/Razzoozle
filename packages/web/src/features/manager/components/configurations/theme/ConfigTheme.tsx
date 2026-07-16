import { THEME_TOKENS } from "@razzoozle/common/theme-tokens"
import { DEFAULT_THEME } from "@razzoozle/common/types/theme"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import ActionFooter from "@razzoozle/web/components/ui/ActionFooter"
import ColorPickerField from "@razzoozle/web/components/ui/ColorPickerField"
import FormSection from "@razzoozle/web/components/ui/FormSection"
import LabelRow from "@razzoozle/web/components/ui/LabelRow"
import {
  AssetPreview,
  AssetPreviewCard,
  SectionCard,
} from "@razzoozle/web/features/manager/components/console"
import AnimationControls from "@razzoozle/web/features/manager/components/configurations/AnimationControls"
import AnimatedBackgroundControls from "@razzoozle/web/features/manager/components/configurations/AnimatedBackgroundControls"
import SoundControls from "@razzoozle/web/features/manager/components/configurations/SoundControls"
import ThemePreviewPanel from "@razzoozle/web/features/manager/components/configurations/theme-preview/ThemePreviewPanel"
import { Image as ImageIcon, Palette, RotateCcw, Sparkles } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import ThemeTemplatesCard from "./ThemeTemplatesCard"
import { getTokenColor, TOKEN_CARDS } from "./constants"
import { useConfigTheme } from "./useConfigTheme"

const ConfigTheme = () => {
  const {
    draft,
    setDraft,
    pendingSlot,
    slotErrors,
    templates,
    templateName,
    setTemplateName,
    templateFileInputRef,
    pendingDeleteId,
    setPendingDeleteId,
    preview,
    setSoundSlot,
    setColorValue,
    setAnswerValue,
    setTokenValue,
    handleUpload,
    clearBackground,
    openPreviewWindow,
    handleSave,
    handleReset,
    handleSaveTemplate,
    handleApplyTemplate,
    handleEditTemplate,
    handleExportTemplate,
    handleImportTemplate,
    handleDeleteTemplate,
  } = useConfigTheme()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

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
            Top live preview. Static thumbnail by default (pointer-events-none +
            click affordance); clicking switches it to an interactive preview.
            A real focusable button toggles the state for keyboard a11y; once
            interactive, an inset corner button toggles back to the thumbnail.
          */}
          <div className="relative">
            <ThemePreviewPanel theme={draft} className="pointer-events-none" />
            <button
              type="button"
              onClick={openPreviewWindow}
              aria-label={t("manager:theme.preview.openWindow", {
                defaultValue: "Live-Vorschau öffnen",
              })}
              className="absolute inset-0 z-20 flex items-end justify-center rounded-[var(--radius-theme)] bg-transparent p-4 transition-colors hover:bg-[var(--ink)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              <span className="rounded-lg bg-[var(--surface)]/90 px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] shadow-sm outline-1 -outline-offset-1 outline-[var(--border-hairline)]">
                {t("manager:theme.preview.openWindow", {
                  defaultValue: "Live-Vorschau öffnen",
                })}
              </span>
            </button>
          </div>

          {/*
          Cockpit: single settings column. The live preview moved to the top of
          the editor. The whole grid stays inside the ConsoleShell tabpanel
          scroller — no nested overflow that would trap mobile scroll.
        */}
          <div className="grid grid-cols-1 gap-4 xl:items-start">
            {/* ── Settings ───────────────────────────────────────────── */}
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
                auth-slot config. Saving rides the unchanged MANAGER.SET_THEME flow.
                The CSS editor sub-block is hidden here (hideCssEditor) — it lives
                under the Dev tab; only the color/slider/wallpaper controls stay. */}
              <AnimatedBackgroundControls
                hideCssEditor
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
                cssValue={draft.backgrounds.animatedCss ?? ""}
                onCssChange={(animatedCss) =>
                  preview({
                    ...draft,
                    backgrounds: { ...draft.backgrounds, animatedCss },
                  })
                }
                renderWallpaperUpload={(key) => (
                  <div className="max-w-[200px]">
                    <AssetPreviewCard
                      label={t("manager:theme.default")}
                      value={draft.backgrounds[key] ?? null}
                      fit="cover"
                      aspect="aspect-video"
                      compact
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
                  </div>
                )}
              />

              {/* ── Logo ─────────────────────────────────────────────── */}
              <FormSection title={t("manager:theme.logo")}>
                {/* Constrain the logo preview to a small thumbnail — only the
                  display shrinks; upload/reset logic is unchanged. */}
                <AssetPreview
                  className="max-w-[160px]"
                  compact
                  hideLabel
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
              </SectionCard>

              {/* ── Sounds (per-slot upload / test / reset) ────────────
                Bound to draft.sounds; uploads emit MANAGER.UPLOAD_SOUND and the
                MANAGER.SOUND_UPLOADED ack feeds the served assetRef back into
                the draft. Saving rides the unchanged MANAGER.SET_THEME flow. */}
              <SoundControls draft={draft} onSlotChange={setSoundSlot} />

              {/* ── Vorlagen ─────────────────────────────────────────── */}
              <ThemeTemplatesCard
                templates={templates}
                templateName={templateName}
                setTemplateName={setTemplateName}
                templateFileInputRef={templateFileInputRef}
                handleSaveTemplate={handleSaveTemplate}
                handleImportTemplate={handleImportTemplate}
                handleApplyTemplate={handleApplyTemplate}
                handleEditTemplate={handleEditTemplate}
                handleExportTemplate={handleExportTemplate}
                setPendingDeleteId={setPendingDeleteId}
              />
            </div>
          </div>
        </div>
      </motion.div>

      <ActionFooter>
        <Button
          variant="secondary"
          type="button"
          onClick={handleReset}
          className="rounded-[var(--radius-theme)]"
        >
          <RotateCcw className="size-4" aria-hidden />
          {t("manager:theme.reset")}
        </Button>
        <Button
          variant="primary"
          className="flex-1 rounded-[var(--radius-theme)] sm:flex-none"
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
