import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import Button from "../../../../components/Button"
import DialogPanel from "../../../../components/manager/DialogPanel"
import Input from "../../../../components/Input"
import Select from "../../../../components/Select"
import { createTemplate, updateTemplate, getTemplate, type TemplateMeta } from "../../../../lib/templatesApi"

export interface TemplateMetaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** If set, this is an edit dialog; if undefined, this is a create dialog */
  template?: TemplateMeta | undefined
  onSaved: () => void
}

interface FormState {
  name: string
  category: string
  description: string
  tags: string
}

interface FormErrors {
  name?: string
  [key: string]: string | undefined
}

const TemplateMetaDialog = ({
  open,
  onOpenChange,
  template,
  onSaved,
}: TemplateMetaDialogProps) => {
  const { t } = useTranslation("manager")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState("")
  const [errors, setErrors] = useState<FormErrors>({})

  // Initialize form with template data or empty
  const [form, setForm] = useState<FormState>({
    name: template?.name || "",
    category: template?.category || "",
    description: template?.description || "",
    tags: template?.tags.join(", ") || "",
  })

  // Reset form when dialog opens/closes or template changes
  useEffect(() => {
    if (open) {
      setForm({
        name: template?.name || "",
        category: template?.category || "",
        description: template?.description || "",
        tags: template?.tags.join(", ") || "",
      })
      setErrors({})
      setServerError("")
      // Focus the name field on open
      setTimeout(() => nameInputRef.current?.focus(), 0)
    }
  }, [open, template])

  const isEditMode = !!template

  const validate = (): boolean => {
    const newErrors: FormErrors = {}

    if (!form.name.trim()) {
      newErrors.name = t("templates.form.nameRequired")
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setServerError("")

    if (!validate()) {
      // Focus first invalid field
      if (errors.name) {
        nameInputRef.current?.focus()
      }
      return
    }

    setLoading(true)

    try {
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)

      if (isEditMode && template) {
        // Edit mode: update existing template
        // Fetch full template to get questions
        const fullTemplate = await getTemplate(template.id)
        await updateTemplate(template.id, {
          name: form.name.trim(),
          category: form.category,
          description: form.description,
          tags,
          questions: fullTemplate.questions, // Pass through unchanged
        })
      } else {
        // Create mode: create new template
        await createTemplate({
          name: form.name.trim(),
          category: form.category,
          description: form.description,
          tags,
          questions: [], // New templates start empty
        })
      }

      // Success
      onOpenChange(false)
      onSaved()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setServerError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, name: e.target.value }))
    if (errors.name) {
      setErrors((prev) => ({ ...prev, name: undefined }))
    }
  }

  const titleId = `template-${isEditMode ? "edit" : "create"}-title`
  const dialogTitle = isEditMode ? t("templates.form.rename") : t("templates.create")

  return (
    <DialogPanel
      open={open}
      onOpenChange={onOpenChange}
      titleId={titleId}
      title={dialogTitle}
      maxWidth="md"
    >
      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4"
        data-testid="template-meta-form"
      >
        {/* Name field */}
        <div className="space-y-1">
          <label htmlFor="template-name" className="block text-sm font-semibold text-[var(--ink)]">
            {t("templates.form.name")}
            <span className="text-[var(--color-primary)]">*</span>
          </label>
          <Input
            ref={nameInputRef}
            id="template-name"
            type="text"
            value={form.name}
            onChange={handleNameChange}
            placeholder={t("templates.form.namePlaceholder")}
            disabled={loading}
            aria-invalid={!!errors.name}
            className={errors.name ? "border-[var(--state-wrong)]" : ""}
          />
          {errors.name && (
            <p className="text-xs text-[var(--state-wrong)]">{errors.name}</p>
          )}
        </div>

        {/* Category field */}
        <div className="space-y-1">
          <label htmlFor="template-category" className="block text-sm font-semibold text-[var(--ink)]">
            {t("templates.form.category")}
          </label>
          <Select
            id="template-category"
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            disabled={loading}
          >
            <option value="">{t("templates.allCategories")}</option>
            <option value="language">{t("templates.categories.language")}</option>
            <option value="science">{t("templates.categories.science")}</option>
            <option value="history">{t("templates.categories.history")}</option>
            <option value="math">{t("templates.categories.math")}</option>
          </Select>
        </div>

        {/* Description field */}
        <div className="space-y-1">
          <label htmlFor="template-description" className="block text-sm font-semibold text-[var(--ink)]">
            {t("templates.form.description")}
          </label>
          <Input
            id="template-description"
            type="text"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder={t("templates.form.descriptionPlaceholder")}
            disabled={loading}
          />
        </div>

        {/* Tags field */}
        <div className="space-y-1">
          <label htmlFor="template-tags" className="block text-sm font-semibold text-[var(--ink)]">
            {t("templates.form.tags")}
          </label>
          <Input
            id="template-tags"
            type="text"
            value={form.tags}
            onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
            placeholder={t("templates.form.tagsPlaceholder")}
            disabled={loading}
          />
          <p className="text-xs text-[var(--ink-medium)]">{t("templates.form.tagsHint")}</p>
        </div>

        {/* Server error */}
        {serverError && (
          <div className="rounded-[var(--radius-theme)] border border-[var(--state-wrong)] bg-[var(--state-wrong)]/10 p-3 text-xs text-[var(--state-wrong)]">
            {serverError}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t("common:cancel")}
          </Button>
          <Button
            type="submit"
            disabled={loading}
            data-testid="template-save-btn"
          >
            {loading && <span className="inline-block animate-spin">⟳</span>}
            {isEditMode ? t("templates.form.save") : t("templates.create")}
          </Button>
        </div>
      </form>
    </DialogPanel>
  )
}

export default TemplateMetaDialog
