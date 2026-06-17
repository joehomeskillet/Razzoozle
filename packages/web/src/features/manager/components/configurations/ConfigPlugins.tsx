import { EVENTS } from "@razzoozle/common/constants"
import type { InstalledPlugin } from "@razzoozle/common/validators/plugin"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import {
  EmptyState,
  SectionCard,
} from "@razzoozle/web/features/manager/components/console"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import {
  AlertTriangle,
  LoaderCircle,
  Puzzle,
  Trash2,
  Upload,
} from "lucide-react"
import { motion } from "motion/react"
import { type DragEvent, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Match the server's import path (importPluginZip takes a raw base64 ZIP). We do
// not hard-cap here — the server validates size/shape — but only accept .zip.
const ACCEPT_ZIP = "application/zip,.zip"

// Strip the "data:...;base64," prefix a FileReader.readAsDataURL produces so the
// wire payload is the raw base64 the server's Buffer.from(zipBase64, "base64")
// expects (mirrors how the theme/sound uploads read a File, minus the dataURL).
const stripDataUrlPrefix = (dataUrl: string): string => {
  const comma = dataUrl.indexOf(",")
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1)
}

const ConfigPlugins = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const { plugins } = useConfig()
  const reveal = useReveal()

  // True while an install ZIP is in flight. Cleared on PLUGIN_CONFIG (success)
  // OR ERROR_MESSAGE (failure) so the spinner never gets stuck (regression we
  // hit before). The file read itself also clears it on reader error.
  const [installing, setInstalling] = useState(false)
  // THIS manager initiated the in-flight install. PLUGIN_CONFIG is broadcast to
  // EVERY connected manager (including ours, on any concurrent plugin change),
  // so the flag below disambiguates "our install just landed" from "a different
  // manager changed a plugin" — only the former clears the spinner + toasts.
  const installRequested = useRef(false)
  // Status message announced to assistive tech via the aria-live region below.
  const [statusMessage, setStatusMessage] = useState("")
  // Whether a file is currently dragged over the dropzone (visual affordance).
  const [dragOver, setDragOver] = useState(false)
  // The plugin id pending an uninstall confirmation; drives the AlertDialog.
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const installed: InstalledPlugin[] = plugins ?? []

  // Server broadcasts the fresh InstalledPlugin[] after a successful install /
  // remove / config change — to ALL managers. Only treat it as OUR install's
  // completion when this manager actually started one (installRequested); a
  // broadcast triggered by a concurrent manager must not clear our spinner or
  // show a false "installed" toast. Reading state directly is safe: useEvent
  // re-binds the handler each render (same pattern as ConfigTheme).
  useEvent(EVENTS.MANAGER.PLUGIN_CONFIG, () => {
    if (installing && installRequested.current) {
      installRequested.current = false
      setInstalling(false)
      setStatusMessage(t("manager:plugins.toast.installed"))
      toast.success(t("manager:plugins.toast.installed"))
    }
  })

  // Failure path: the server emits ERROR_MESSAGE (not PLUGIN_CONFIG) on a
  // rejected install/remove. Clear the spinner and toast the (translated)
  // reason. The post-auth console mounts no other broad ERROR_MESSAGE toast
  // (ManagerPassword is unmounted; SimControl filters errors:manager.sim), so
  // this is the surface for plugin errors without a double toast.
  useEvent(EVENTS.MANAGER.ERROR_MESSAGE, (message) => {
    // This channel also carries non-plugin manager errors (errors:manager.*,
    // errors:failedToReadConfig — e.g. on reconnect re-auth). Only react to the
    // plugin handlers' errors (errors:plugin.*); ignore the rest so we never
    // clear the install spinner or toast on an unrelated error.
    if (!message.startsWith("errors:plugin")) return
    if (installing && installRequested.current) {
      installRequested.current = false
      setInstalling(false)
    }
    const reason = t(message, { defaultValue: message })
    setStatusMessage(reason)
    toast.error(reason)
  })

  // File → base64 → PLUGIN_INSTALL { zipBase64 }. Mirrors the theme/sound
  // upload read; strips the dataURL prefix to send raw base64.
  const installFile = (file: File) => {
    if (installing) {
      return
    }

    installRequested.current = true
    setInstalling(true)
    setStatusMessage(t("manager:plugins.installing"))

    const reader = new FileReader()
    reader.onload = () => {
      socket.emit(EVENTS.MANAGER.PLUGIN_INSTALL, {
        zipBase64: stripDataUrlPrefix(reader.result as string),
      })
    }
    reader.onerror = () => {
      installRequested.current = false
      setInstalling(false)
      const reason = t("errors:plugin.uploadFailed", { defaultValue: "" })
      setStatusMessage(reason)
      toast.error(reason)
    }
    reader.readAsDataURL(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Allow re-selecting the same file after an error.
    e.target.value = ""

    if (file) {
      installFile(file)
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)

    const file = e.dataTransfer.files?.[0]

    if (file) {
      installFile(file)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const openFilePicker = () => fileInputRef.current?.click()

  // Keyboard activation of the dropzone (Enter/Space) — it's role="button".
  const handleDropzoneKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      openFilePicker()
    }
  }

  const handleRemove = () => {
    if (!pendingRemoveId) {
      return
    }

    socket.emit(EVENTS.MANAGER.PLUGIN_REMOVE, { id: pendingRemoveId })
    setPendingRemoveId(null)
  }

  const pendingRemoveName =
    installed.find((p) => p.id === pendingRemoveId)?.name ?? ""

  return (
    <>
      <motion.div
        className="flex flex-1 flex-col"
        variants={reveal.item()}
        initial="hidden"
        animate="visible"
        transition={reveal.spring}
      >
        <div className="flex flex-col gap-6 pb-10">
          {/* ── Sicherheitswarnung ─────────────────────────────────────── */}
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800"
          >
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-red-600"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-bold">
                {t("manager:plugins.warning.title")}
              </p>
              <p className="mt-1 text-sm">
                {t("manager:plugins.warning.body")}
              </p>
            </div>
          </div>

          {/* ── Installation ───────────────────────────────────────────── */}
          <SectionCard
            icon={<Upload className="size-5" />}
            title={t("manager:plugins.install")}
            description={t("manager:plugins.installHint", { defaultValue: "" })}
          >
            <div
              role="button"
              tabIndex={0}
              aria-labelledby="plugin-dropzone-label"
              aria-disabled={installing}
              onClick={openFilePicker}
              onKeyDown={handleDropzoneKeyDown}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${
                dragOver
                  ? "border-[var(--color-primary)] bg-[var(--accent-tint)]"
                  : "border-gray-300 bg-gray-50 hover:bg-gray-100"
              } ${installing ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {installing ? (
                <LoaderCircle
                  className="size-7 animate-spin text-gray-500"
                  aria-hidden
                />
              ) : (
                <Upload className="size-7 text-gray-400" aria-hidden />
              )}
              <p
                id="plugin-dropzone-label"
                className="text-sm font-semibold text-gray-700"
              >
                {installing
                  ? t("manager:plugins.installing")
                  : t("manager:plugins.dropzone")}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ZIP}
                className="sr-only"
                disabled={installing}
                aria-label={t("manager:plugins.dropzone")}
                onChange={handleFileInput}
              />
            </div>
            {/* Announce install progress / completion / failure to AT. */}
            <p className="sr-only" role="status" aria-live="polite">
              {statusMessage}
            </p>
          </SectionCard>

          {/* ── Installierte Plugins ───────────────────────────────────── */}
          <SectionCard
            icon={<Puzzle className="size-5" />}
            title={t("manager:plugins.installed")}
          >
            {installed.length === 0 ? (
              <EmptyState
                icon={Puzzle}
                headline={t("manager:plugins.empty")}
                hint={t("manager:plugins.emptyHint", { defaultValue: "" })}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {installed.map((plugin) => (
                  <li
                    key={plugin.id}
                    className="flex flex-col gap-3 rounded-xl bg-gray-50 p-3 outline-1 -outline-offset-1 outline-gray-200 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="truncate text-sm font-semibold text-gray-700">
                          {plugin.name}
                        </p>
                        <span className="text-xs font-medium text-gray-500">
                          v{plugin.version}
                        </span>
                      </div>
                      {plugin.capabilities.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {plugin.capabilities.map((cap) => (
                            <li
                              key={cap}
                              className="rounded-full bg-[var(--accent-tint)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-contrast)]"
                            >
                              {t(`manager:plugins.capabilities.${cap}`, {
                                defaultValue: cap,
                              })}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <Button
                      variant="danger"
                      size="md"
                      type="button"
                      className="shrink-0 rounded-lg"
                      onClick={() => setPendingRemoveId(plugin.id)}
                      aria-label={`${t("manager:plugins.uninstall")} — ${plugin.name}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      {t("manager:plugins.uninstall")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </motion.div>

      <AlertDialog
        open={pendingRemoveId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemoveId(null)
          }
        }}
        title={t("manager:plugins.uninstall")}
        description={t("manager:plugins.uninstallConfirm", {
          name: pendingRemoveName,
        })}
        confirmLabel={t("manager:plugins.uninstall")}
        onConfirm={handleRemove}
      />
    </>
  )
}

export default ConfigPlugins
