import { EVENTS } from "@razzoozle/common/constants"
import { SectionCard } from "@razzoozle/web/features/manager/components/console"
import AnimatedCssEditor from "@razzoozle/web/features/manager/components/configurations/AnimatedCssEditor"
import ConfigSkeleton from "@razzoozle/web/features/manager/components/configurations/ConfigSkeleton"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import { Info, Sparkles } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import { ApiExplorerCard } from "./ApiExplorerCard"
import { LogsCard } from "./LogsCard"
import { ObservabilityCard } from "./ObservabilityCard"
import { useDevTelemetry } from "./useDevTelemetry"

// Dev tab — read-only developer console for the manager, organised into
// functional IA groups. Cards only reuse shipped contracts and shared console
// primitives (no new events, deps, or CSS files).
//
// Auth: tab is gated admin + devMode in configurations/index.tsx (BUILTIN_TABS
// roleGate/gated + isTabAllowed). Route-level redirect in config.$tab.tsx.
//
// Redaction: passwords, API tokens and answer solutions are never logged.

/** Lightweight section header (no Accordion in repo — YAGNI). */
const GroupHeader = ({ children }: { children: ReactNode }) => (
  <p className="px-1 text-xs font-semibold tracking-wide text-[var(--ink-faint)] uppercase">
    {children}
  </p>
)

const ConfigDev = () => {
  const { t } = useTranslation("manager")
  const {
    socket,
    isConnected,
    withToken,
    games,
    displays,
    snapshot,
    apiInfo,
    now,
  } = useDevTelemetry()

  // Live theme + local mirror of animated-background CSS. Persists via the
  // same MANAGER.SET_THEME flow AnimatedBackgroundControls uses.
  const { theme, setTheme } = useThemeStore()
  const [animatedCss, setAnimatedCss] = useState(
    theme.backgrounds.animatedCss ?? "",
  )

  const saveAnimatedCss = (css: string) => {
    setAnimatedCss(css)
    const next = {
      ...theme,
      backgrounds: { ...theme.backgrounds, animatedCss: css },
    }
    setTheme(next)
    socket.emit(EVENTS.MANAGER.SET_THEME, next)
  }

  return (
    <>
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        <PageHeader
          title={t("dev.title")}
          subtitle={t("dev.intro")}
          action={
            <span
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--status-pending-bg)] px-2.5 py-1.5 text-xs font-semibold text-[var(--status-pending-text)]"
              role="status"
            >
              <Info className="size-3.5 shrink-0" aria-hidden />
              {t("dev.mode")}
            </span>
          }
        />
      </div>

      <div className="space-y-6">
        {/* ── Debug & Diagnose ─────────────────────────────────────────
            ObservabilityCard: live games, displays, health, metrics.
            Metrics (perf) live inside this card — no separate perf card. */}
        <div className="space-y-3">
          <GroupHeader>{t("dev.section.debug")}</GroupHeader>
          <ObservabilityCard
            isConnected={isConnected}
            games={games}
            snapshot={snapshot}
            displays={displays}
            now={now}
            withToken={withToken}
          />
        </div>

        {/* ── Data Export ──────────────────────────────────────────────
            LogsCard downloads redacted server/client log rings. */}
        <div className="space-y-3">
          <GroupHeader>{t("dev.section.export")}</GroupHeader>
          <LogsCard withToken={withToken} />
        </div>

        {/* ── API & Docs ───────────────────────────────────────────────
            Self-documenting HTTP surface + token placeholder EmptyState. */}
        <div className="space-y-3">
          <GroupHeader>{t("dev.section.api")}</GroupHeader>
          <ApiExplorerCard apiInfo={apiInfo} withToken={withToken} />
        </div>

        {/* ── Theme Development ────────────────────────────────────────
            ConfigSkeleton (CSS/JS overrides + transfer/reset) and
            AnimatedCssEditor. Destructive ops live inside ConfigSkeleton
            and are marked with the danger-zone border there. */}
        <div className="space-y-3">
          <GroupHeader>{t("dev.section.theme")}</GroupHeader>
          {/* ConfigSkeleton is prop-less and brings its own SectionCards. */}
          <ConfigSkeleton />
          <SectionCard
            icon={<Sparkles className="size-5" />}
            title={t("dev.animatedCss.title")}
            description={t("dev.animatedCss.description")}
          >
            <AnimatedCssEditor value={animatedCss} onChange={saveAnimatedCss} />
          </SectionCard>
        </div>
      </div>
    </>
  )
}

export default ConfigDev
