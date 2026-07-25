import { EVENTS } from "@razzoozle/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import { useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const MAX_ASSET_BYTES = 512 * 1024

export function useSkeletonDrafts() {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const { theme } = useThemeStore()

  const [cssDraft, setCssDraft] = useState("")
  const [jsDraft, setJsDraft] = useState("")
  const [savingKind, setSavingKind] = useState<"css" | "js" | null>(null)
  const savingKindRef = useRef<"css" | "js" | null>(null)
  const [resetting, setResetting] = useState(false)

  // Prefill editors from live, served files if enabled
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
        // Network/parse failure — keep empty editor
      }
    }

    if (theme.customCssEnabled) void load("/theme/skeleton.css", setCssDraft)
    if (theme.customJsEnabled) void load("/theme/skeleton.js", setJsDraft)

    return () => {
      cancelled = true
    }
  }, [theme.customCssEnabled, theme.customJsEnabled])

  useEvent(EVENTS.MANAGER.SET_SKELETON_ASSET_SUCCESS, ({ kind }) => {
    savingKindRef.current = null
    setSavingKind(null)
    toast.success(
      kind === "css"
        ? t("manager:skeleton.toast.cssSaved")
        : t("manager:skeleton.toast.jsSaved"),
    )
  })

  useEvent(EVENTS.MANAGER.RESET_SKELETON_SUCCESS, () => {
    setResetting(false)
    setCssDraft("")
    setJsDraft("")
    toast.success(t("manager:skeleton.toast.reset"))
  })

  useEvent(EVENTS.MANAGER.THEME_ERROR, (message) => {
    setResetting(false)
    if (savingKindRef.current) {
      savingKindRef.current = null
      setSavingKind(null)
    }
    toast.error(message)
  })

  const save = (kind: "css" | "js") => {
    const text = kind === "css" ? cssDraft : jsDraft
    const byteLen = new TextEncoder().encode(text).byteLength

    if (byteLen > MAX_ASSET_BYTES) {
      toast.error(
        t("manager:skeleton.toast.tooLarge", {
          kind: kind.toUpperCase(),
          maxKb: 512,
        }),
      )
      return
    }

    savingKindRef.current = kind
    setSavingKind(kind)

    socket?.emit(EVENTS.MANAGER.SET_SKELETON_ASSET, {
      kind,
      code: text,
    })
  }

  const reset = () => {
    setResetting(true)
    socket?.emit(EVENTS.MANAGER.RESET_SKELETON)
  }

  return {
    cssDraft,
    setCssDraft,
    jsDraft,
    setJsDraft,
    savingKind,
    resetting,
    save,
    reset,
  }
}
