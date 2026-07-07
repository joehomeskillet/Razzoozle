import { EVENTS } from "@razzoozle/common/constants"
import { SectionCard } from "@razzoozle/web/features/manager/components/console"
import AnimatedCssEditor from "@razzoozle/web/features/manager/components/configurations/AnimatedCssEditor"
import ConfigSkeleton from "@razzoozle/web/features/manager/components/configurations/ConfigSkeleton"
import BackendPanel from "@razzoozle/web/features/manager/components/configurations/BackendPanel"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import { Palette, Sparkles } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { ApiExplorerCard } from "./ApiExplorerCard"
import { LogsCard } from "./LogsCard"
import { ObservabilityCard } from "./ObservabilityCard"
import { useDevTelemetry } from "./useDevTelemetry"

// Dev tab — a read-only "developer console" for the manager. Stacked
// SectionCards: theme overrides (skeleton CSS/JS + animated-background CSS)
// relocated here from the Design tab, an API Explorer that opens the
// self-documenting HTTP surface, a live Observability panel wired to the
// existing manager socket events (LIST_GAMES / GAMES_DATA, DISPLAY.STATUS,
// METRICS.SUBSCRIBE / HEALTH), and a Logs card to download the recent redacted
// server/client log rings. It only reuses already-shipped contracts and the
// shared console primitives — it adds neither a new event, a new dep, nor a new
// CSS file.
//
// Redaction notice: passwords, API tokens and answer solutions are never logged.
// That promise is surfaced as the API Explorer's description so it stays visible.

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

  // Live theme + a local mirror of the animated-background CSS. The dev card is
  // a minimal editor for theme.backgrounds.animatedCss: it reads the current
  // value from the theme store, holds the edit locally, and persists on change
  // via the same MANAGER.SET_THEME flow AnimatedBackgroundControls used (the
  // full theme carries this field under backgrounds.animatedCss).
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
    <div className="space-y-4">
      <BackendPanel />

      {/* ── Theme overrides (relocated from the Design tab) ─────────────
        ConfigSkeleton is prop-less and self-contained: it brings its own
        SectionCards for the CSS-Override + JavaScript-Override editors. */}
      <SectionCard
        icon={<Palette className="size-5" />}
        title={t("dev.theme.title", { defaultValue: "Theme-Overrides" })}
        description={t("dev.theme.description", {
          defaultValue:
            "Freies CSS und JavaScript, das zusätzlich zum Theme auf allen Geräten geladen wird.",
        })}
      >
        <ConfigSkeleton />
      </SectionCard>

      {/* ── Animated CSS — minimal theme draft wired to MANAGER.SET_THEME ── */}
      <SectionCard
        icon={<Sparkles className="size-5" />}
        title={t("dev.animatedCss.title", { defaultValue: "Animated CSS" })}
        description={t("dev.animatedCss.description", {
          defaultValue:
            "Eigenes CSS für den animierten Hintergrund. Speichern überträgt das aktuelle Theme.",
        })}
      >
        <AnimatedCssEditor value={animatedCss} onChange={saveAnimatedCss} />
      </SectionCard>

      <ApiExplorerCard apiInfo={apiInfo} withToken={withToken} />

      <ObservabilityCard
        isConnected={isConnected}
        games={games}
        snapshot={snapshot}
        displays={displays}
        now={now}
        withToken={withToken}
      />

      <LogsCard withToken={withToken} />
    </div>
  )
}

export default ConfigDev
