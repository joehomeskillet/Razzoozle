// design-sync bundle bootstrap (bundled via cfg.extraEntries). Three jobs:
//
// 1. Initialize the default i18next instance with the repo's real EN strings so
//    components using useTranslation (AlertDialog, ColorPickerField, ...) render
//    labels instead of raw keys — in preview cards AND in designs built with
//    the bundle. Namespaces: common + manager (theme/contrast strings).
// 2. Seed __APP_VERSION__ — a Vite build-time define the design-sync esbuild
//    never sets; Background.tsx renders it and ReferenceErrors without this.
// 3. Re-export react-hot-toast's `toast` from the bundle so previews/designs
//    fire toasts on the SAME module instance the bundled <Toaster/> subscribes
//    to (a separately-bundled copy has its own store and the toast never shows).
import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import common from "../packages/web/src/locales/en/common.json"
import game from "../packages/web/src/locales/en/game.json"
import manager from "../packages/web/src/locales/en/manager.json"
import results from "../packages/web/src/locales/en/results.json"

;(globalThis as unknown as Record<string, unknown>).__APP_VERSION__ ??= "design-preview"

// Apply the canonical runtime theme defaults (amber accent etc.) exactly like
// the app boot does — the static @theme seeds in the compiled CSS are NOT the
// live values (e.g. accent seed is pink #FF2D6E, canonical is amber #ff9900).
import { applyTheme } from "../packages/web/src/features/theme/apply"
import { DEFAULT_THEME } from "../packages/common/src/types/theme"
if (typeof document !== "undefined") {
  try {
    applyTheme(DEFAULT_THEME)
  } catch {
    // never let theme seeding break the bundle load
  }
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common", "manager", "game", "results"],
    resources: { en: { common, manager, game, results } },
    interpolation: { escapeValue: false },
  })
}

export { toast } from "react-hot-toast"
// MotionConfig from the SAME motion instance as the bundled components —
// previews wrap in <MotionConfig reducedMotion="always"> so frozen-clock
// captures see final animation states instead of opacity-0 staggers.
export { MotionConfig } from "motion/react"
export const dsI18nReady = true
