import { EVENTS } from "@razzoozle/common/constants"
import Button from "@razzoozle/web/components/Button"
import {
  getClientId,
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import {
  SectionCard,
  SubGroup,
} from "@razzoozle/web/features/manager/components/console"
import {
  AlertTriangle,
  Code2,
  Download,
  FileCode,
  Upload,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type ChangeEvent, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// The HTTP header the manager-gated skeleton endpoints expect (frozen name in
// docs/design/skeleton-system.md §8). The value is the durable clientId the
// manager's socket session authenticated with — the server checks it against
// the logged-manager set (manager.isLoggedClientId), so this is reload-safe and
// the password never leaves the login form.
const MANAGER_TOKEN_HEADER = "X-Manager-Token"

// Client-side guard mirroring the server's per-asset 512 KB cap (§8.2) so we
// reject oversized text before it rides the socket. Second line of defence —
// the server validates authoritatively.
const MAX_ASSET_BYTES = 512 * 1024

const ConfigSkeleton = () => {
  const { socket } = useSocket()
  const managerToken = getClientId()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [cssDraft, setCssDraft] = useState("")
  const [jsDraft, setJsDraft] = useState("")
  // Which save is awaiting a SET_SKELETON_ASSET_SUCCESS / THEME_ERROR, so the
  // shared success/error listeners can clear the right pending state.
  const [savingKind, setSavingKind] = useState<"css" | "js" | null>(null)
  // Mirror of savingKind for the shared THEME_ERROR / SUCCESS listeners, which
  // capture state at registration time and would otherwise read a stale value
  // (leaving the Save button stuck disabled). Mirrors ConfigTheme's pendingActionRef.
  const savingKindRef = useRef<"css" | "js" | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [importing, setImporting] = useState(false)

  // Prefill the editors from the live, nginx-served files. A 404 (no skeleton
  // uploaded yet) leaves the textarea empty rather than erroring.
  useEffect(() => {
    let cancelled = false

    const load = async (path: string, set: (value: string) => void) => {
      try {
        const res = await fetch(path, { cache: "no-store" })
        if (!res.ok) {
          return
        }
        const text = await res.text()
        if (!cancelled) {
          set(text)
        }
      } catch {
        // Network/parse failure — keep the empty editor; the manager can still
        // author from scratch.
      }
    }

    void load("/theme/skeleton.css", setCssDraft)
    void load("/theme/skeleton.js", setJsDraft)

    return () => {
      cancelled = true
    }
  }, [])

  useEvent(EVENTS.MANAGER.SET_SKELETON_ASSET_SUCCESS, ({ kind }) => {
    savingKindRef.current = null
    setSavingKind(null)
    toast.success(
      kind === "css"
        ? t("manager:skeleton.toast.cssSaved", {
            defaultValue: "CSS gespeichert",
          })
        : t("manager:skeleton.toast.jsSaved", {
            defaultValue: "JavaScript gespeichert",
          }),
    )
  })

  useEvent(EVENTS.MANAGER.THEME_ERROR, (message) => {
    if (savingKindRef.current) {
      savingKindRef.current = null
      setSavingKind(null)
    }
    toast.error(message)
  })

  // Download the skeleton ZIP. A plain <a download> can't set headers, so we
  // fetch with the manager token, then trigger a download from an object URL.
  const handleDownload = async () => {
    setDownloading(true)

    try {
      const res = await fetch("/api/skeleton/export", {
        headers: { [MANAGER_TOKEN_HEADER]: managerToken },
      })

      if (!res.ok) {
        let message = `${res.status}`
        try {
          const body = await res.json()
          if (body && typeof body.error === "string") {
            message = body.error
          }
        } catch {
          // Non-JSON error body — fall back to the status code.
        }
        toast.error(
          t("manager:skeleton.toast.exportFailed", {
            defaultValue: "Export fehlgeschlagen: {{message}}",
            message,
          }),
        )

        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "razzoozle-skeleton.zip"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(
        t("manager:skeleton.toast.exportFailed", {
          defaultValue: "Export fehlgeschlagen: {{message}}",
          message: t("common:networkError", { defaultValue: "Netzwerkfehler" }),
        }),
      )
    } finally {
      setDownloading(false)
    }
  }

  // Upload a skeleton ZIP. Posts the raw file bytes with the manager token.
  // Clients live-update via the MANAGER.THEME broadcast the server emits.
  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input so re-selecting the same file fires onChange again.
    e.target.value = ""

    if (!file) {
      return
    }

    setImporting(true)

    try {
      const res = await fetch("/api/skeleton/import", {
        method: "POST",
        headers: {
          [MANAGER_TOKEN_HEADER]: managerToken,
          "Content-Type": "application/zip",
        },
        body: file,
      })

      let body: { ok?: boolean; error?: unknown } | null = null
      try {
        body = await res.json()
      } catch {
        body = null
      }

      if (!res.ok || !body?.ok) {
        const message =
          body && typeof body.error === "string" ? body.error : `${res.status}`
        toast.error(
          t("manager:skeleton.toast.importFailed", {
            defaultValue: "Import fehlgeschlagen: {{message}}",
            message,
          }),
        )

        return
      }

      toast.success(
        t("manager:skeleton.toast.imported", {
          defaultValue: "Skeleton importiert",
        }),
      )
    } catch {
      toast.error(
        t("manager:skeleton.toast.importFailed", {
          defaultValue: "Import fehlgeschlagen: {{message}}",
          message: t("common:networkError", { defaultValue: "Netzwerkfehler" }),
        }),
      )
    } finally {
      setImporting(false)
    }
  }

  const handleSaveAsset = (kind: "css" | "js") => () => {
    const content = kind === "css" ? cssDraft : jsDraft

    if (new Blob([content]).size > MAX_ASSET_BYTES) {
      toast.error(
        t("manager:skeleton.toast.tooLarge", {
          defaultValue: "Datei zu groß (max. 512 KB)",
        }),
      )

      return
    }

    savingKindRef.current = kind
    setSavingKind(kind)
    socket.emit(EVENTS.MANAGER.SET_SKELETON_ASSET, { kind, content })
  }

  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }}
    >
      <div className="flex flex-col gap-6 pb-6">
        {/* ── Import / Export ──────────────────────────────────────── */}
        <SectionCard
          icon={<Download className="size-5" />}
          title={t("manager:skeleton.transfer.title", {
            defaultValue: "Skeleton übertragen",
          })}
          description={t("manager:skeleton.transfer.description", {
            defaultValue:
              "Exportiere das komplette Design (Tokens, CSS, JS, Assets) als ZIP oder importiere ein vorbereitetes Skeleton.",
          })}
        >
          <SubGroup>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                type="button"
                onClick={handleDownload}
                disabled={downloading}
              >
                <Download className="size-4" aria-hidden />
                {t("manager:skeleton.transfer.download", {
                  defaultValue: "Skeleton herunterladen",
                })}
              </Button>

              <Button
                variant="secondary"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                <Upload className="size-4" aria-hidden />
                {t("manager:skeleton.transfer.upload", {
                  defaultValue: "Skeleton hochladen (ZIP)",
                })}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={handleUpload}
              />
            </div>
          </SubGroup>
        </SectionCard>

        {/* ── CSS editor ───────────────────────────────────────────── */}
        <SectionCard
          icon={<FileCode className="size-5" />}
          title={t("manager:skeleton.css.title", {
            defaultValue: "CSS-Override",
          })}
          description={t("manager:skeleton.css.description", {
            defaultValue:
              "Freies CSS, das zusätzlich zum Theme auf allen Geräten geladen wird.",
          })}
        >
          <label htmlFor="skeleton-css" className="sr-only">
            {t("manager:skeleton.css.title", { defaultValue: "CSS-Override" })}
          </label>
          <textarea
            id="skeleton-css"
            value={cssDraft}
            onChange={(e) => setCssDraft(e.target.value)}
            spellCheck={false}
            rows={12}
            placeholder={t("manager:skeleton.css.placeholder", {
              defaultValue: "/* :root { --team-red: #ff0000 } */",
            })}
            className="min-h-48 w-full resize-y rounded-lg bg-gray-900 p-3 font-mono text-sm text-gray-100 outline-1 -outline-offset-1 outline-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              type="button"
              onClick={handleSaveAsset("css")}
              disabled={savingKind === "css"}
            >
              {t("manager:skeleton.css.save", { defaultValue: "CSS speichern" })}
            </Button>
          </div>
        </SectionCard>

        {/* ── JS editor (DANGER) ───────────────────────────────────── */}
        <SectionCard
          icon={<Code2 className="size-5" />}
          title={t("manager:skeleton.js.title", {
            defaultValue: "JavaScript-Override",
          })}
          description={t("manager:skeleton.js.description", {
            defaultValue:
              "Freies JavaScript, das auf jedem verbundenen Gerät ausgeführt wird.",
          })}
        >
          {/* Prominent red warning — this is stored XSS by design (contract §1). */}
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800"
          >
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-red-600"
              aria-hidden
            />
            <span>
              {t("manager:skeleton.js.warning", {
                defaultValue:
                  "⚠ Dieses JavaScript läuft auf jedem Spieler-Gerät — nur vertrauenswürdigen Code einfügen (stored-XSS-Risiko).",
              })}
            </span>
          </div>

          <label htmlFor="skeleton-js" className="sr-only">
            {t("manager:skeleton.js.title", {
              defaultValue: "JavaScript-Override",
            })}
          </label>
          <textarea
            id="skeleton-js"
            value={jsDraft}
            onChange={(e) => setJsDraft(e.target.value)}
            spellCheck={false}
            rows={12}
            placeholder={t("manager:skeleton.js.placeholder", {
              defaultValue: "// console.log(window.razzoozle.theme)",
            })}
            className="min-h-48 w-full resize-y rounded-lg bg-gray-900 p-3 font-mono text-sm text-gray-100 outline-1 -outline-offset-1 outline-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          />
          <div className="flex justify-end">
            <Button
              variant="danger"
              type="button"
              onClick={handleSaveAsset("js")}
              disabled={savingKind === "js"}
            >
              {t("manager:skeleton.js.save", {
                defaultValue: "JavaScript speichern",
              })}
            </Button>
          </div>
        </SectionCard>
      </div>
    </motion.div>
  )
}

export default ConfigSkeleton
