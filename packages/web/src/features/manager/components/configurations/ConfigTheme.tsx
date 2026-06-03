import { EVENTS } from "@razzia/common/constants"
import { DEFAULT_THEME, type Theme } from "@razzia/common/types/theme"
import Button from "@razzia/web/components/Button"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { applyTheme } from "@razzia/web/features/theme/apply"
import { useThemeStore } from "@razzia/web/features/theme/store"
import { useState } from "react"
import toast from "react-hot-toast"

type Slot = "auth" | "managerGame" | "playerGame"

const SLOTS: { key: Slot; label: string }[] = [
  { key: "auth", label: "Startseite / Beitritt" },
  { key: "managerGame", label: "Host-Bildschirm (Frage)" },
  { key: "playerGame", label: "Spieler-Handy (im Spiel)" },
]

const ConfigTheme = () => {
  const { socket } = useSocket()
  const { theme, setTheme } = useThemeStore()
  const [draft, setDraft] = useState<Theme>(theme)

  useEvent(EVENTS.MANAGER.BACKGROUND_UPLOADED, ({ slot, path }) => {
    setDraft((prev) => ({
      ...prev,
      backgrounds: { ...prev.backgrounds, [slot]: path },
    }))
    toast.success("Hintergrund hochgeladen")
  })

  useEvent(EVENTS.MANAGER.SET_THEME_SUCCESS, (saved) => {
    setTheme(saved)
    applyTheme(saved)
    toast.success("Design gespeichert")
  })

  useEvent(EVENTS.MANAGER.THEME_ERROR, (message) => {
    toast.error(message)
  })

  const preview = (next: Theme) => {
    setDraft(next)
    applyTheme(next)
  }

  const setColor = (key: "colorPrimary" | "colorSecondary") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      preview({ ...draft, [key]: e.target.value })

  const setAnswer =
    (index: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const answerColors = [...draft.answerColors] as Theme["answerColors"]
      answerColors[index] = e.target.value
      preview({ ...draft, answerColors })
    }

  const handleUpload =
    (slot: Slot) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) {
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        socket.emit(EVENTS.MANAGER.UPLOAD_BACKGROUND, {
          slot,
          dataUrl: reader.result as string,
        })
      }
      reader.readAsDataURL(file)
    }

  const clearBackground = (slot: Slot) => () =>
    setDraft((prev) => ({
      ...prev,
      backgrounds: { ...prev.backgrounds, [slot]: null },
    }))

  const handleSave = () => {
    socket.emit(EVENTS.MANAGER.SET_THEME, draft)
  }

  const handleReset = () => {
    preview(DEFAULT_THEME)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">UI-Farben</p>
        <div className="flex gap-4">
          <label className="flex flex-col items-center gap-1 text-xs text-gray-500">
            <input
              type="color"
              value={draft.colorPrimary}
              onChange={setColor("colorPrimary")}
              className="size-10 cursor-pointer rounded"
            />
            Primär
          </label>
          <label className="flex flex-col items-center gap-1 text-xs text-gray-500">
            <input
              type="color"
              value={draft.colorSecondary}
              onChange={setColor("colorSecondary")}
              className="size-10 cursor-pointer rounded"
            />
            Hintergrund
          </label>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          Antwort-Farben
        </p>
        <div className="flex gap-4">
          {draft.answerColors.map((color, index) => (
            <label
              // oxlint-disable-next-line no-array-index-key
              key={index}
              className="flex flex-col items-center gap-1 text-xs text-gray-500"
            >
              <input
                type="color"
                value={color}
                onChange={setAnswer(index)}
                className="size-10 cursor-pointer rounded"
              />
              {["A", "B", "C", "D"][index]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">Hintergründe</p>
        <div className="flex flex-col gap-3">
          {SLOTS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-gray-700">{label}</p>
                <p className="truncate text-xs text-gray-400">
                  {draft.backgrounds[key] ?? "Standard"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <label className="bg-primary cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold text-white">
                  Bild
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleUpload(key)}
                  />
                </label>
                {draft.backgrounds[key] && (
                  <button
                    type="button"
                    onClick={clearBackground(key)}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100"
                  >
                    Standard
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto flex gap-2 pt-2">
        <Button className="bg-primary flex-1 text-white" onClick={handleSave}>
          Speichern
        </Button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-md border border-gray-200 px-4 text-sm font-semibold text-gray-500 hover:bg-gray-100"
        >
          Zurücksetzen
        </button>
      </div>
    </div>
  )
}

export default ConfigTheme
