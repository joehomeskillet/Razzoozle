import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import {
  SectionCard,
  SubGroup,
} from "@razzoozle/web/features/manager/components/console"
import {
  AlertTriangle,
  Code2,
  Copy,
  Download,
  FileCode,
  RotateCcw,
  Upload,
} from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useSkeletonDrafts } from "./skeleton/useSkeletonDrafts"
import { useSkeletonTransfer } from "./skeleton/useSkeletonTransfer"

const ConfigSkeleton = () => {
  const { t } = useTranslation()

  const {
    cssDraft,
    setCssDraft,
    jsDraft,
    setJsDraft,
    savingKind,
    resetting,
    save,
    reset,
  } = useSkeletonDrafts()

  const {
    fileInputRef,
    downloading,
    importing,
    downloadPackage,
    handleFileChange,
    triggerFileInput,
  } = useSkeletonTransfer(() => {
    window.location.reload()
  })

  const [confirmingJsSave, setConfirmingJsSave] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* CSS Editor Section */}
      <SectionCard
        icon={<Code2 className="h-5 w-5" />}
        title={t("manager:skeleton.cssTitle", { defaultValue: "Custom CSS Skeleton" })}
        description={t("manager:skeleton.cssDescription", {
          defaultValue: "Passe das globale Stylesheet an. CSS wird auf allen Client-Seiten injiziert.",
        })}
      >
        <div className="flex flex-col gap-4">
          <SubGroup>
            <label className="mb-2 block text-sm font-semibold text-ink">
              {t("manager:skeleton.cssLabel", { defaultValue: "CSS Code" })}
            </label>
            <textarea
              value={cssDraft}
              onChange={(e) => setCssDraft(e.target.value)}
              placeholder="/* Custom CSS */\nbody {\n  --color-primary: #7c3aed;\n}"
              rows={10}
              className="w-full rounded-lg border border-hairline bg-surface-2 p-3 font-mono text-sm text-ink focus:border-brand-primary focus:outline-none"
            />
          </SubGroup>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(cssDraft)
                toast.success(t("manager:skeleton.toast.copied"))
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              {t("manager:common.copy", { defaultValue: "Kopieren" })}
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={savingKind === "css"}
              onClick={() => save("css")}
            >
              {savingKind === "css"
                ? t("manager:common.saving", { defaultValue: "Speichern..." })
                : t("manager:common.save", { defaultValue: "Speichern" })}
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* JS Editor Section */}
      <SectionCard
        icon={<FileCode className="h-5 w-5" />}
        title={t("manager:skeleton.jsTitle", { defaultValue: "Custom JS Skeleton" })}
        description={t("manager:skeleton.jsDescription", {
          defaultValue: "Füge benutzerdefiniertes JavaScript hinzu. ACHTUNG: JS wird direkt ausgeführt.",
        })}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-lg bg-status-pending-bg p-3 text-sm text-status-pending-text">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>
              {t("manager:skeleton.jsWarning", {
                defaultValue: "Sicherheitshinweis: Führe nur vertrauenswürdigen Code aus.",
              })}
            </span>
          </div>

          <SubGroup>
            <label className="mb-2 block text-sm font-semibold text-ink">
              {t("manager:skeleton.jsLabel", { defaultValue: "JavaScript Code" })}
            </label>
            <textarea
              value={jsDraft}
              onChange={(e) => setJsDraft(e.target.value)}
              placeholder="// Custom JS\nconsole.log('Skeleton loaded');"
              rows={10}
              className="w-full rounded-lg border border-hairline bg-surface-2 p-3 font-mono text-sm text-ink focus:border-brand-primary focus:outline-none"
            />
          </SubGroup>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(jsDraft)
                toast.success(t("manager:skeleton.toast.copied"))
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              {t("manager:common.copy", { defaultValue: "Kopieren" })}
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={savingKind === "js"}
              onClick={() => setConfirmingJsSave(true)}
            >
              {savingKind === "js"
                ? t("manager:common.saving", { defaultValue: "Speichern..." })
                : t("manager:common.save", { defaultValue: "Speichern" })}
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Transfer & Reset Section */}
      <SectionCard
        icon={<Download className="h-5 w-5" />}
        title={t("manager:skeleton.transferTitle", { defaultValue: "Import & Export" })}
        description={t("manager:skeleton.transferDescription", {
          defaultValue: "Sichere dein Theme-Paket als ZIP oder importiere ein bestehendes Skeleton-Paket.",
        })}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={downloading}
              onClick={downloadPackage}
            >
              <Download className="mr-2 h-4 w-4" />
              {downloading
                ? t("manager:skeleton.exporting", { defaultValue: "Exportiere..." })
                : t("manager:skeleton.exportButton", { defaultValue: "Export (ZIP)" })}
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={importing}
              onClick={triggerFileInput}
            >
              <Upload className="mr-2 h-4 w-4" />
              {importing
                ? t("manager:skeleton.importing", { defaultValue: "Importiere..." })
                : t("manager:skeleton.importButton", { defaultValue: "Import (ZIP)" })}
            </Button>
          </div>

          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={resetting}
            onClick={reset}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {resetting
              ? t("manager:skeleton.resetting", { defaultValue: "Zurücksetzen..." })
              : t("manager:skeleton.resetButton", { defaultValue: "Alle Skripte zurücksetzen" })}
          </Button>
        </div>
      </SectionCard>

      <AlertDialog
        open={confirmingJsSave}
        onOpenChange={(open) => !open && setConfirmingJsSave(false)}
        title={t("manager:skeleton.jsConfirmTitle", { defaultValue: "JavaScript-Code speichern" })}
        description={t("manager:skeleton.jsConfirmDescription", {
          defaultValue: "Der eingegebene JavaScript-Code wird im Browser aller Spieler ausgeführt. Möchtest du fortfahren?",
        })}
        confirmLabel={t("manager:common.confirm", { defaultValue: "Bestätigen & Speichern" })}
        onConfirm={() => {
          setConfirmingJsSave(false)
          save("js")
        }}
      />
    </div>
  )
}

export default ConfigSkeleton
