import { EVENTS } from "@razzia/common/constants"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { createFileRoute } from "@tanstack/react-router"
import { ClipboardPaste, MonitorCheck, MonitorPlay } from "lucide-react"
import { type KeyboardEvent, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// AddSatellite — manager-side pairing form for a Raspberry Pi "satellite"
// display (kiosk on a beamer/TV). The Pi prints a per-device token to its HDMI
// output on first boot (see satellite/PROVISIONING.md). The manager pastes that
// token here to pair the Pi to the live game session; once paired, the Pi loads
// the presentation automatically.
//
// This component is purely the controller side: it emits the token over the
// already-established manager socket. The server-side validator that grants the
// paired token manager-display privileges lives in the socket package (its
// behaviour is intentionally additive and out of scope here). The form stays
// behaviour-stable for unpaired games — it never touches the existing auth or
// game-start flow.

// Pairing event consumed by the satellite server handler. Emitted as a plain
// string (not a typed ClientToServerEvents key) so this additive feature does
// not require changes to the shared socket type surface.
const PAIR_SATELLITE_EVENT = "manager:pairSatellite"

// A satellite token is `openssl rand -base64 32` (44 chars incl. padding).
// Validate loosely: non-empty after trimming and at least a sane minimum length
// so an obvious typo is caught client-side before we emit.
const MIN_TOKEN_LENGTH = 16

const AddSatelliteForm = () => {
  const { socket } = useSocket()
  const { gameId } = useManagerStore()
  const { t } = useTranslation()

  const [token, setToken] = useState("")
  const [paired, setPaired] = useState(false)

  // If the server rejects the credential (e.g. a mistyped token), clear the
  // optimistic "paired" badge so the manager knows to re-enter it.
  useEvent(EVENTS.MANAGER.UNAUTHORIZED, () => {
    setPaired(false)
    toast.error(
      t("manager:satellite.invalidToken", {
        defaultValue: "Enter the token printed on the satellite's screen",
      }),
    )
  })

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setToken(text.trim())
      }
    } catch {
      toast.error(
        t("manager:satellite.pasteFailed", {
          defaultValue: "Couldn't read the clipboard — paste the token manually",
        }),
      )
    }
  }

  const handleSubmit = () => {
    const trimmed = token.trim()

    if (trimmed.length < MIN_TOKEN_LENGTH) {
      toast.error(
        t("manager:satellite.invalidToken", {
          defaultValue: "Enter the token printed on the satellite's screen",
        }),
      )

      return
    }

    // Pair the display: hand the token + current game to the server so it binds
    // this Pi's socket to the session. `gameId` may be null in the lobby; the
    // server pairs the token to whatever game the manager starts next.
    // oxlint-disable-next-line no-explicit-any, no-unsafe-argument
    ;(socket as any).emit(PAIR_SATELLITE_EVENT, {
      token: trimmed,
      gameId: gameId ?? undefined,
    })

    // Also register the token through the standard manager-auth path so a server
    // build that only knows MANAGER.AUTH still accepts this display.
    socket.emit(EVENTS.MANAGER.AUTH, trimmed)

    // Optimistic confirmation: the Pi already authenticates with the same token
    // over its own socket, so a successful emit here means the pair is live.
    setPaired(true)
    toast.success(
      t("manager:satellite.paired", { defaultValue: "Satellite paired" }),
    )
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      handleSubmit()
    }
  }

  const handleChange = (value: string) => {
    setToken(value)
    // Editing the token after a successful pair invalidates the shown status.
    if (paired) {
      setPaired(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Card className="w-full max-w-none shadow-none">
        <div className="mb-3 flex items-center gap-2">
          <MonitorPlay className="text-primary size-5" />
          <p className="font-semibold">
            {t("manager:satellite.title", { defaultValue: "Satellite Display" })}
          </p>
        </div>

        <p className="mb-4 text-sm text-gray-500">
          {t("manager:satellite.description", {
            defaultValue:
              "Pair a Raspberry Pi display. Boot the satellite, read the token on the big screen, then paste it here.",
          })}
        </p>

        <label className="mb-1 text-sm font-semibold text-gray-600">
          {t("manager:satellite.tokenLabel", { defaultValue: "Pairing token" })}
        </label>

        <div className="flex items-stretch gap-2">
          <Input
            variant="sm"
            value={token}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("manager:satellite.tokenPlaceholder", {
              defaultValue: "Paste the token from the satellite screen",
            })}
            className="flex-1"
          />
          <button
            type="button"
            onClick={handlePaste}
            title={t("manager:satellite.paste", { defaultValue: "Paste" })}
            className="rounded-lg px-3 text-gray-500 outline-2 outline-gray-300 hover:bg-gray-100 hover:text-gray-700"
          >
            <ClipboardPaste className="size-4" />
          </button>
        </div>

        <Button className="mt-4 w-full" onClick={handleSubmit}>
          {t("manager:satellite.pair", { defaultValue: "Pair satellite" })}
        </Button>

        {paired && (
          <div className="mt-4 flex items-center gap-2 rounded-md bg-green-50 p-2.5 text-sm font-semibold text-green-700">
            <MonitorCheck className="size-4 shrink-0" />
            {t("manager:satellite.paired", { defaultValue: "Satellite paired" })}
          </div>
        )}
      </Card>
    </div>
  )
}

const AddSatellitePage = () => <AddSatelliteForm />

export const Route = createFileRoute("/manager/config/AddSatellite")({
  component: AddSatellitePage,
})

export { AddSatelliteForm, PAIR_SATELLITE_EVENT }
export default AddSatelliteForm
