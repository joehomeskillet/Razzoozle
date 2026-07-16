import type { ThemeTemplate } from "@razzoozle/common/types/theme"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import {
  EmptyState,
  SectionCard,
  SubGroup,
} from "@razzoozle/web/features/manager/components/console"
import { BookMarked, Download, Trash2, Upload } from "lucide-react"
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react"
import { useTranslation } from "react-i18next"

export interface ThemeTemplatesCardProps {
  templates: ThemeTemplate[]
  templateName: string
  setTemplateName: Dispatch<SetStateAction<string>>
  templateFileInputRef: RefObject<HTMLInputElement | null>
  handleSaveTemplate: () => void
  handleImportTemplate: (_e: ChangeEvent<HTMLInputElement>) => void
  handleApplyTemplate: (_template: ThemeTemplate) => void
  handleEditTemplate: (_template: ThemeTemplate) => void
  handleExportTemplate: (_template: ThemeTemplate) => void
  setPendingDeleteId: Dispatch<SetStateAction<string | null>>
}

const ThemeTemplatesCard = ({
  templates,
  templateName,
  setTemplateName,
  templateFileInputRef,
  handleSaveTemplate,
  handleImportTemplate,
  handleApplyTemplate,
  handleEditTemplate,
  handleExportTemplate,
  setPendingDeleteId,
}: ThemeTemplatesCardProps) => {
  const { t } = useTranslation()

  return (
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
              className="flex flex-col gap-3 rounded-[var(--radius-theme)] bg-[var(--surface-2)] p-3 outline-1 -outline-offset-1 outline-[var(--border-hairline)]"
            >
              <p className="min-w-0 truncate text-sm font-semibold text-[var(--ink-muted)]">
                {template.name}
              </p>
              <div className="flex h-6 overflow-hidden rounded-md outline-1 -outline-offset-1 outline-[var(--border-hairline)]">
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
  )
}

export default ThemeTemplatesCard
