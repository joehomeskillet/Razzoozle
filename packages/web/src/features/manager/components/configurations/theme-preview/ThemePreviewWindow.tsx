import { DEFAULT_THEME, type Theme } from "@razzoozle/common/types/theme"
import { applyTheme } from "@razzoozle/web/features/theme/apply"
import {
  isThemeDraftMessage,
  openThemePreviewChannel,
  postPreviewReady,
} from "@razzoozle/web/features/theme/preview-channel"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import ThemePreviewPanel from "./ThemePreviewPanel"

/**
 * ThemePreviewWindow — the standalone `/theme-preview` popup body.
 *
 * The manager Design editor opens this window and pushes the current draft
 * Theme over a same-origin BroadcastChannel (see preview-channel.ts). On each
 * draft we both re-render the montage (`liveTheme`) and call `applyTheme`, which
 * re-themes this popup's OWN document chrome live. We post a single `ready`
 * handshake on mount so the editor re-sends the draft even if it opened first.
 */
const ThemePreviewWindow = () => {
  const { t } = useTranslation()
  const storeTheme = useThemeStore((s) => s.theme)
  const [liveTheme, setLiveTheme] = useState<Theme>(storeTheme ?? DEFAULT_THEME)
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    const ch = openThemePreviewChannel()
    channelRef.current = ch

    const onMessage = (e: MessageEvent) => {
      if (isThemeDraftMessage(e.data)) {
        setLiveTheme(e.data.theme)
        applyTheme(e.data.theme)
      }
    }

    ch?.addEventListener("message", onMessage)

    // Handshake: tell the editor we mounted so it (re)sends the current draft,
    // covering the race where the editor posted before we were listening.
    postPreviewReady(ch)

    return () => {
      ch?.removeEventListener("message", onMessage)
      ch?.close()
      channelRef.current = null
    }
  }, [])

  return (
    <div className="min-h-dvh w-full bg-[var(--color-field-cream)] px-4 py-6 text-[color:var(--color-field-ink)]">
      <h1 className="mb-4 text-center text-lg font-bold tracking-tight">
        {t("manager:theme.preview.title", { defaultValue: "Vorschau" })}
      </h1>
      <ThemePreviewPanel theme={liveTheme} className="mx-auto max-w-md" />
    </div>
  )
}

export default ThemePreviewWindow
