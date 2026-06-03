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

type Slot = "auth" | "managerGame" | "playerGame" | "logo"

const BG_SLOTS: { key: "auth" | "managerGame" | "playerGame"; label: string }[] =
  [
    { key: "auth", label: "Startseite / Beitritt" },
    { key: "managerGame", label: "Host-Bildschirm (Frage)" },
    { key: "playerGame", label: "Spieler-Handy (im Spiel)" },
  ]

const ConfigTheme = () => {
  const { socket } = useSocket()
  const { theme, setTheme } = useThemeStore()
  const [draft, setDraft] = useState<Theme>({ ...DEFAULT_THEME, ...theme })

  useEvent(EVENTS.MANAGER.BACKGROUND_UPLOADED, ({ slot, path }) => {
    setDraft((prev) =>
      slot === "logo"
        ? { ...prev, logo: path }
        : { ...prev, backgrounds: { ...prev.backgrounds, [slot]: path } },
    )
    toast.success("Bild hochgeladen")
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

  const setColor =
    (key: "colorPrimary" | "colorSecondary" | "accentColor" | "answerTextColor") =>
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

  const clearBackground = (slot: "auth" | "managerGame" | "playerGame") => () =>
    setDraft((prev) => ({
      ...prev,
      backgrounds: { ...prev.backgrounds, [slot]: null },
    }))

  const handleSave = () => socket.emit(EVENTS.MANAGER.SET_THEME, draft)
  const handleReset = () => preview({ ...DEFAULT_THEME })

  const colorField = (
    label: string,
    value: string,
    onChange: (_e: React.ChangeEvent<HTMLInputElement>) => void,
  ) => (
    <label className="flex flex-col items-center gap-1 text-xs text-gray-500">
      <input
        type="color"
        value={value}
        onChange={onChange}
        className="size-10 cursor-pointer rounded"
      />
      {label}
    </label>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">Branding</p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            App-Titel
            <input
              value={draft.appTitle ?? ""}
              maxLength={40}
              placeholder="Razzia"
              onChange={(e) =>
                preview({ ...draft, appTitle: e.target.value || null })
              }
              className="rounded-lg border border-gray-200 px-2 py-1 text-gray-800 outline-none"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-gray-700">Logo</p>
              <p className="truncate text-xs text-gray-400">
                {draft.logo ?? "Standard"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label className="bg-primary cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold text-white">
                Bild
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleUpload("logo")}
                />
              </label>
              {draft.logo && (
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, logo: null }))}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100"
                >
                  Standard
                </button>
              )}
            </div>
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gray-600">
            <input
              type="checkbox"
              checked={draft.showBranding}
              onChange={(e) =>
                preview({ ...draft, showBranding: e.target.checked })
              }
              className="size-4 cursor-pointer"
            />
            „Razzia"-Footer zeigen
          </label>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">UI-Farben</p>
        <div className="flex gap-4">
          {colorField("Primär", draft.colorPrimary, setColor("colorPrimary"))}
          {colorField(
            "Hintergrund",
            draft.colorSecondary,
            setColor("colorSecondary"),
          )}
          {colorField("Akzent", draft.accentColor, setColor("accentColor"))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          Antwort-Farben
        </p>
        <div className="flex flex-wrap items-end gap-4">
          {draft.answerColors.map((color, index) => (
            // oxlint-disable-next-line no-array-index-key
            <div key={index}>
              {colorField(["A", "B", "C", "D"][index] ?? "", color, setAnswer(index))}
            </div>
          ))}
          {colorField(
            "Text",
            draft.answerTextColor,
            setColor("answerTextColor"),
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          Hintergrund abdunkeln ({draft.scrim}%)
        </p>
        <input
          type="range"
          min={0}
          max={100}
          value={draft.scrim}
          onChange={(e) => preview({ ...draft, scrim: Number(e.target.value) })}
          className="accent-primary w-full cursor-pointer"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">Hintergründe</p>
        <div className="flex flex-col gap-3">
          {BG_SLOTS.map(({ key, label }) => (
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
