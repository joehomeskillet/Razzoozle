import { getGameBackend } from "@razzoozle/web/features/game/contexts/socket-context"
import {
  ListRow,
  SectionCard,
} from "@razzoozle/web/features/manager/components/console"
import { CheckCircle2, Server, XCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

interface BackendHealth {
  rust: boolean | null
  node: boolean | null
}

// Backend health panel: shows current backend selection, pings both backends,
// and provides a toggle to switch between Node and Rust (with reload).
// The default backend is set by VITE_DEFAULT_BACKEND at build time, and
// localStorage overrides it.
const BackendPanel = () => {
  const { t } = useTranslation("manager")
  const [health, setHealth] = useState<BackendHealth>({ rust: null, node: null })
  const [choice, setChoice] = useState<"rust" | "node">(getGameBackend())
  const [isApplying, setIsApplying] = useState(false)

  // On mount, ping both backends to check health
  useEffect(() => {
    const checkHealth = async () => {
      try {
        // Check Node backend at /health
        const nodeRes = await fetch("/health", { method: "HEAD" })
        setHealth((prev) => ({ ...prev, node: nodeRes.ok }))
      } catch {
        setHealth((prev) => ({ ...prev, node: false }))
      }

      try {
        // Check Rust backend at /_rust/health
        const rustRes = await fetch("/_rust/health", { method: "HEAD" })
        setHealth((prev) => ({ ...prev, rust: rustRes.ok }))
      } catch {
        setHealth((prev) => ({ ...prev, rust: false }))
      }
    }

    checkHealth()
  }, [])

  const handleApply = () => {
    setIsApplying(true)
    localStorage.setItem("gameBackend", choice)
    // Force reload so socket reconnects to the chosen backend
    window.location.reload()
  }

  const HealthBadge = ({ isUp }: { isUp: boolean | null }) => {
    if (isUp === null) {
      return <span className="text-xs text-[var(--ink-subtle)]">—</span>
    }
    return (
      <div className="flex items-center gap-1">
        {isUp ? (
          <>
            <CheckCircle2 className="size-4 text-[var(--state-correct)]" />
            <span className="text-xs text-[var(--state-correct)]">
              {t("dev.backend.up", { defaultValue: "up" })}
            </span>
          </>
        ) : (
          <>
            <XCircle className="size-4 text-[var(--state-wrong)]" />
            <span className="text-xs text-[var(--state-wrong)]">
              {t("dev.backend.down", { defaultValue: "down" })}
            </span>
          </>
        )}
      </div>
    )
  }

  const currentBackend = getGameBackend()

  return (
    <SectionCard
      icon={<Server className="size-5" />}
      title={t("dev.backend.title", { defaultValue: "Backend" })}
      description={t("dev.backend.description", {
        defaultValue:
          "Switch between Node and Rust backends. Default is set via VITE_DEFAULT_BACKEND at build time, and localStorage overrides it.",
      })}
    >
      <div className="space-y-4">
        {/* Backend health status */}
        <div className="space-y-2">
          <ListRow
            title={t("dev.backend.node", { defaultValue: "Node (/)" })}
            meta={<HealthBadge isUp={health.node} />}
          />
          <ListRow
            title={t("dev.backend.rust", { defaultValue: "Rust (/_rust/)" })}
            meta={<HealthBadge isUp={health.rust} />}
          />
        </div>

        {/* Backend selector */}
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium text-[var(--ink-muted)]">
            {t("dev.backend.choice", { defaultValue: "Choose backend:" })}
          </p>
          <div className="space-y-1">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="backend"
                value="node"
                checked={choice === "node"}
                onChange={(e) => setChoice(e.target.value as "node")}
                disabled={isApplying}
                className="cursor-pointer"
              />
              <span className="text-sm">
                {t("dev.backend.node", { defaultValue: "Node (/)" })}
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="backend"
                value="rust"
                checked={choice === "rust"}
                onChange={(e) => setChoice(e.target.value as "rust")}
                disabled={isApplying}
                className="cursor-pointer"
              />
              <span className="text-sm">
                {t("dev.backend.rust", { defaultValue: "Rust (/_rust/)" })}
              </span>
            </label>
          </div>

          {choice !== currentBackend && (
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="mt-3 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" // token-ok: white-on-primary AA (D6)
            >
              {isApplying
                ? t("dev.backend.applying", {
                    defaultValue: "Applying...",
                  })
                : t("dev.backend.apply", {
                    defaultValue: "Apply",
                  })}
            </button>
          )}
        </div>
      </div>
    </SectionCard>
  )
}

export default BackendPanel
