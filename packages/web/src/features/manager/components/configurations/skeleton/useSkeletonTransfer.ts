import { fetchWithAuth } from "@razzoozle/web/lib/api"
import { getClientId } from "@razzoozle/web/features/game/contexts/socket-context"
import { type ChangeEvent, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const MANAGER_TOKEN_HEADER = "X-Manager-Token"

export function useSkeletonTransfer(onImportSuccess: () => void) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [importing, setImporting] = useState(false)

  const downloadPackage = async () => {
    setDownloading(true)
    try {
      const managerToken = getClientId()
      const res = await fetchWithAuth("/api/manager/skeleton/export", {
        headers: managerToken ? { [MANAGER_TOKEN_HEADER]: managerToken } : {},
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "razzoozle-skeleton.zip"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(t("manager:skeleton.toast.exported"))
    } catch {
      toast.error(t("manager:skeleton.toast.exportFailed"))
    } finally {
      setDownloading(false)
    }
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const managerToken = getClientId()
      const headers: Record<string, string> = {
        "Content-Type": "application/zip",
      }
      if (managerToken) {
        headers[MANAGER_TOKEN_HEADER] = managerToken
      }

      const body = await file.arrayBuffer()
      const res = await fetchWithAuth("/api/manager/skeleton/import", {
        method: "POST",
        headers,
        body,
      })

      if (!res.ok) {
        let msg = ""
        try {
          const json = (await res.json()) as { error?: string }
          if (json.error) msg = json.error
        } catch {
          // non-JSON
        }
        throw new Error(msg || `HTTP ${res.status}`)
      }

      toast.success(t("manager:skeleton.toast.imported"))
      onImportSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      toast.error(
        msg
          ? t("manager:skeleton.toast.importFailedReason", { reason: msg })
          : t("manager:skeleton.toast.importFailed"),
      )
    } finally {
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  return {
    fileInputRef,
    downloading,
    importing,
    downloadPackage,
    handleFileChange,
    triggerFileInput,
  }
}
