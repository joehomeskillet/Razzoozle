import {
  type BackgroundSlot,
  EVENTS,
  type SoundSlot,
  type ThemeSlot,
} from "@razzoozle/common/constants"
import {
  DEFAULT_THEME,
  type Theme,
  type ThemeTemplate,
} from "@razzoozle/common/types/theme"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { setTokenColor } from "@razzoozle/web/features/manager/utils/setTokenColor"
import { applyTheme } from "@razzoozle/web/features/theme/apply"
import {
  isThemeReadyMessage,
  openThemePreviewChannel,
  postThemeDraft,
  THEME_PREVIEW_ROUTE,
  THEME_PREVIEW_WINDOW_FEATURES,
  THEME_PREVIEW_WINDOW_NAME,
} from "@razzoozle/web/features/theme/preview-channel"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import { type ChangeEvent, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { MAX_UPLOAD_BYTES, type ThemeAction } from "./constants"

export const useConfigTheme = () => {
  const { socket } = useSocket()
  const { theme, setTheme } = useThemeStore()
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Theme>({ ...DEFAULT_THEME, ...theme })
  // The single slot whose upload is currently in flight (one at a time).
  const [pendingSlot, setPendingSlot] = useState<ThemeSlot | null>(null)
  // The theme operation currently awaiting a server response, used to route a
  // context-free THEME_ERROR to the right handler / pending-state cleanup.
  const pendingActionRef = useRef<ThemeAction | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const previewWindowRef = useRef<Window | null>(null)
  // Latest draft, read inside the channel message listener to avoid a stale closure.
  const draftRef = useRef<Theme>(draft)
  // Hidden file input for importing a template JSON (client-only round-trip).
  const templateFileInputRef = useRef<HTMLInputElement>(null)
  // Slot-scoped upload error, surfaced inline next to the slot's controls.
  const [slotErrors, setSlotErrors] = useState<
    Partial<Record<ThemeSlot, string>>
  >({})
  // Named theme presets (full ThemeTemplate[] from THEME_TEMPLATE.DATA).
  const [templates, setTemplates] = useState<ThemeTemplate[]>([])
  const [templateName, setTemplateName] = useState("")
  // The template id pending a delete confirmation; drives the AlertDialog.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const setSlotError = (slot: ThemeSlot, message: string | null) =>
    setSlotErrors((prev) => {
      if (message) {
        return { ...prev, [slot]: message }
      }

      // Drop the slot's error without a dynamic `delete`.
      return Object.fromEntries(
        Object.entries(prev).filter(([key]) => key !== slot),
      ) as Partial<Record<ThemeSlot, string>>
    })

  const preview = (next: Theme) => {
    setDraft(next)
    applyTheme(next)
  }

  // Immutably set one sound-slot override in the draft (assetRef or null). Used
  // by SoundControls for both the upload-result feedback and the reset action;
  // rides the unchanged MANAGER.SET_THEME save path (theme.sounds round-trips).
  const setSoundSlot = (slot: SoundSlot, value: string | null) =>
    setDraft((prev) => ({
      ...prev,
      sounds: { ...prev.sounds, [slot]: value },
    }))

  useEvent(EVENTS.MANAGER.BACKGROUND_UPLOADED, ({ slot, path }) => {
    pendingActionRef.current = null
    setPendingSlot((current) => (current === slot ? null : current))
    setSlotError(slot, null)
    setDraft((prev) =>
      slot === "logo"
        ? { ...prev, logo: path }
        : { ...prev, backgrounds: { ...prev.backgrounds, [slot]: path } },
    )
    toast.success(t("manager:theme.toast.imageUploaded"))
  })

  useEvent(EVENTS.MANAGER.SET_THEME_SUCCESS, (saved) => {
    pendingActionRef.current = null
    setTheme(saved)
    applyTheme(saved)
    toast.success(t("manager:theme.toast.saved"))
  })

  useEvent(EVENTS.MANAGER.THEME_ERROR, (message) => {
    // THEME_ERROR carries no slot/context. Route by the action we kicked off:
    // an upload failure attaches inline to its slot; everything else toasts.
    const action = pendingActionRef.current
    pendingActionRef.current = null

    if (action === "upload" && pendingSlot) {
      setSlotError(pendingSlot, message)
      setPendingSlot(null)

      return
    }

    toast.error(message)
  })

  // Request the saved templates once on mount.
  useEffect(() => {
    socket.emit(EVENTS.THEME_TEMPLATE.LIST)
  }, [socket])

  // Open the cross-window preview channel once. When the preview window mounts
  // it posts a "ready" message; we answer by re-sending the current draft so a
  // window opened mid-edit immediately shows the latest theme.
  useEffect(() => {
    const channel = openThemePreviewChannel()
    channelRef.current = channel
    if (!channel) {
      return
    }
    const onMessage = (e: MessageEvent) => {
      if (isThemeReadyMessage(e.data)) {
        postThemeDraft(channelRef.current, draftRef.current)
      }
    }
    channel.addEventListener("message", onMessage)
    return () => {
      channel.removeEventListener("message", onMessage)
      channel.close()
      channelRef.current = null
    }
  }, [])

  // Keep the ref current for the ready-handshake re-post, and stream every draft
  // change (whatever setter produced it — not only preview()) to the live window.
  useEffect(() => {
    draftRef.current = draft
    postThemeDraft(channelRef.current, draft)
  }, [draft])

  useEvent(EVENTS.THEME_TEMPLATE.DATA, setTemplates)

  useEvent(EVENTS.THEME_TEMPLATE.SAVE_SUCCESS, () => {
    pendingActionRef.current = null
    toast.success(t("manager:theme.templates.saved"))
    setTemplateName("")
  })

  useEvent(EVENTS.THEME_TEMPLATE.ERROR, (message) => {
    pendingActionRef.current = null
    toast.error(t(message))
  })

  // ColorPickerField hands back the hex string directly (not a change event).
  const setColorValue =
    (
      key:
        | "colorPrimary"
        | "colorSecondary"
        | "accentColor"
        | "answerTextColor",
    ) =>
    (hex: string) =>
      preview({ ...draft, [key]: hex })

  const setAnswerValue = (index: number) => (hex: string) => {
    const answerColors = [...draft.answerColors] as Theme["answerColors"]
    answerColors[index] = hex
    preview({ ...draft, answerColors })
  }

  // Registry-driven setter for a THEME_TOKENS dot-path (e.g. "tierColors.gold");
  // rides the same preview() → applyTheme() live-preview + draft path as the
  // hand-written color fields above. Saving uses the unchanged MANAGER.SET_THEME
  // flow — the full Theme draft already carries these fields.
  const setTokenValue = (path: string) => (hex: string) =>
    preview(setTokenColor(draft, path, hex))

  // AssetPreview hands back a File (its own size guard runs first); we keep a
  // defensive MAX_UPLOAD_BYTES check before streaming over the socket.
  const handleUpload = (slot: ThemeSlot) => (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setSlotError(slot, "errors:theme.imageTooLarge")

      return
    }

    setSlotError(slot, null)
    setPendingSlot(slot)
    pendingActionRef.current = "upload"

    const reader = new FileReader()
    reader.onload = () => {
      socket.emit(EVENTS.MANAGER.UPLOAD_BACKGROUND, {
        slot,
        dataUrl: reader.result as string,
      })
    }
    reader.onerror = () => {
      setSlotError(slot, "errors:theme.uploadFailed")
      setPendingSlot((current) => (current === slot ? null : current))
      pendingActionRef.current = null
    }
    reader.readAsDataURL(file)
  }

  const clearBackground = (slot: BackgroundSlot) => () =>
    setDraft((prev) => ({
      ...prev,
      backgrounds: { ...prev.backgrounds, [slot]: null },
    }))

  // Open (or focus) the standalone live-preview window. BroadcastChannel carries
  // the draft updates; the returned handle is kept only to focus an existing window.
  const openPreviewWindow = () => {
    if (previewWindowRef.current && !previewWindowRef.current.closed) {
      previewWindowRef.current.focus()
      return
    }
    previewWindowRef.current = window.open(
      THEME_PREVIEW_ROUTE,
      THEME_PREVIEW_WINDOW_NAME,
      THEME_PREVIEW_WINDOW_FEATURES,
    )
    // Push the current draft once; the window also re-requests via its "ready" handshake.
    postThemeDraft(channelRef.current, draft)
  }

  const handleSave = () => {
    pendingActionRef.current = "save"
    socket.emit(EVENTS.MANAGER.SET_THEME, draft)
  }
  const handleReset = () => preview({ ...DEFAULT_THEME })

  const handleSaveTemplate = () => {
    const name = templateName.trim()

    if (!name) {
      return
    }

    pendingActionRef.current = "template"
    socket.emit(EVENTS.THEME_TEMPLATE.SAVE, { name, theme: draft })
  }

  // Load a template into the editor so the admin can preview + save it.
  const handleApplyTemplate = (template: ThemeTemplate) =>
    preview({ ...DEFAULT_THEME, ...template.theme })

  // Edit a saved template: load its theme into the editable editor state and
  // prefill the name field so a re-save overwrites the same template
  // (dedupe-on-save). Same load path as Apply, but targets the name input too.
  const handleEditTemplate = (template: ThemeTemplate) => {
    preview({ ...DEFAULT_THEME, ...template.theme })
    setTemplateName(template.name)
  }

  // Export a saved template's Theme to a JSON file (client-only, no backend).
  // Mirrors the Blob/object-URL anchor pattern used by the quiz export.
  const handleExportTemplate = (template: ThemeTemplate) => {
    const slug = (s: string) =>
      s
        .normalize("NFKD")
        .replace(/[^\w-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
    const json = JSON.stringify(
      { name: template.name, theme: template.theme },
      null,
      2,
    )
    const blob = new Blob([json], { type: "application/json;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${slug(template.name) || "theme-template"}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // Import a template JSON: parse (guarded), then emit THEME_TEMPLATE.SAVE with
  // { name, theme }. The server validator rejects malformed payloads.
  const handleImportTemplate = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = (event) => {
      let data: unknown = null

      try {
        data = JSON.parse(event.target?.result as string)
      } catch {
        toast.error(
          t("manager:theme.templates.importError", {
            defaultValue: "Ungültige Vorlagen-Datei",
          }),
        )

        return
      }

      const parsed = data as { name?: unknown; theme?: unknown }
      const name =
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim()
          : file.name.replace(/\.json$/i, "")

      pendingActionRef.current = "template"
      socket.emit(EVENTS.THEME_TEMPLATE.SAVE, { name, theme: parsed.theme })
    }

    reader.onerror = () => {
      reader.abort()
      toast.error(
        t("manager:theme.templates.readError", {
          defaultValue: "Datei konnte nicht gelesen werden",
        }),
      )
    }

    reader.readAsText(file)
    e.target.value = ""
  }

  const handleDeleteTemplate = () => {
    if (!pendingDeleteId) {
      return
    }

    socket.emit(EVENTS.THEME_TEMPLATE.DELETE, { id: pendingDeleteId })
    setPendingDeleteId(null)
  }

  return {
    draft,
    setDraft,
    pendingSlot,
    slotErrors,
    templates,
    templateName,
    setTemplateName,
    templateFileInputRef,
    pendingDeleteId,
    setPendingDeleteId,
    preview,
    setSoundSlot,
    setColorValue,
    setAnswerValue,
    setTokenValue,
    handleUpload,
    clearBackground,
    openPreviewWindow,
    handleSave,
    handleReset,
    handleSaveTemplate,
    handleApplyTemplate,
    handleEditTemplate,
    handleExportTemplate,
    handleImportTemplate,
    handleDeleteTemplate,
  }
}
