import { EVENTS } from "@razzoozle/common/constants"
import type { SharedResult } from "@razzoozle/common/types/game"
import Background from "@razzoozle/web/components/Background"
import Button from "@razzoozle/web/components/Button"
import Loader from "@razzoozle/web/components/Loader"
import TrophySticker from "@razzoozle/web/features/game/components/TrophySticker"
import { useEvent, useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import useStickerExport from "@razzoozle/web/features/game/utils/useStickerExport"
import useScreenSize from "@razzoozle/web/hooks/useScreenSize"
import clsx from "clsx"
import { Share2 } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// react-confetti is lazy-loaded into its own chunk so it stays out of the eager
// bundle: it only fires once the shared result has loaded, never on first paint.
const ReactConfetti = lazy(() => import("react-confetti"))

interface Props {
  id: string
}

/** Valid #rgb/#rrggbb else spec fallback (colorSecondary). */
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
function safeBg(hex: string | null | undefined): string {
  return typeof hex === "string" && HEX_RE.test(hex.trim())
    ? hex.trim()
    : "#2e1065"
}

const medalColor = [
  {
    background: "bg-yellow-500",
    border: "border-yellow-600",
  },
  {
    background: "bg-gray-400",
    border: "border-gray-200",
  },
  {
    background: "bg-amber-700",
    border: "border-amber-800",
  },
]

const Medal = ({ rank }: { rank: number }) => {
  const color = medalColor[rank - 1]

  return (
    <div
      className={clsx(
        "relative flex aspect-square size-14 items-center justify-center overflow-hidden rounded-full border-4 text-2xl font-extrabold text-white drop-shadow-sm md:size-20 md:border-6 md:text-4xl",
        color.background,
        color.border,
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        <div className="absolute top-[30%] left-1/2 h-6 w-[160%] -translate-x-1/2 -rotate-40 bg-white/25" />
        <div className="absolute top-[70%] left-1/2 h-3 w-[160%] -translate-x-1/2 -rotate-40 bg-white/25" />
      </div>
      <p
        className="relative z-10"
        style={{ textShadow: "1px 1px rgba(0,0,0, 0.25)" }}
      >
        {rank}
      </p>
    </div>
  )
}

// ─── Winner sticker (opt-in, rank 1 only) ─────────────────────────────────────
// Mirrors PlayerFinished's ShareStickerButton: an off-screen <TrophySticker/>
// capture root + an opt-in button that snapshots it to PNG via useStickerExport.

const WinnerStickerButton = ({
  name,
  points,
  subject,
}: {
  name: string
  points: number
  subject: string
}) => {
  const { t } = useTranslation()
  const theme = useThemeStore((s) => s.theme)
  const captureRef = useRef<HTMLDivElement>(null)
  const { exportSticker, isExporting } = useStickerExport()

  const onCreate = async () => {
    const node = captureRef.current
    if (!node) return
    try {
      const outcome = await exportSticker(node, {
        backgroundColor: safeBg(theme.colorSecondary),
      })
      toast.success(t(`game:recap.sticker.${outcome}`))
    } catch (err) {
      // User cancelled the native share sheet — not an error, stay silent.
      if (err instanceof Error && err.name === "AbortError") return
      toast.error(t("game:recap.sticker.error"))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onCreate}
        disabled={isExporting}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-base font-bold text-white shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/60 focus-visible:outline-none disabled:opacity-60"
      >
        <Share2 className="size-5" aria-hidden />
        {isExporting
          ? t("game:recap.sticker.creating")
          : t("results:share.createSticker")}
      </button>

      {/* Off-screen capture root for useStickerExport. */}
      <div
        ref={captureRef}
        aria-hidden
        style={{ position: "fixed", left: -99999, top: 0 }}
      >
        <TrophySticker
          rank={1}
          name={name}
          points={points}
          subject={subject}
        />
      </div>
    </>
  )
}

const SharePage = ({ id }: Props) => {
  const { connect, isConnected, socket } = useSocket()
  const { t, i18n } = useTranslation()
  const reducedMotion = useReducedMotion()
  const { width, height } = useScreenSize()

  const [result, setResult] = useState<SharedResult | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    connect()
  }, [connect])

  useEffect(() => {
    if (isConnected) {
      socket.emit(EVENTS.RESULTS.GET_SHARED, id)
    }
  }, [isConnected, socket, id])

  const handleSharedData = useCallback(
    (data: SharedResult) => {
      if (data && data.id === id) {
        setResult(data)
        setNotFound(false)
      }
    },
    [id],
  )

  useEvent(EVENTS.RESULTS.SHARED_DATA, handleSharedData)

  useEffect(() => {
    // Only arm the not-found timer once we're actually connected and still have
    // no result — arming before connection would flash "not found" during the
    // initial socket handshake. Cleared on unmount or when data arrives.
    if (result || !isConnected) return

    const timer = setTimeout(() => {
      setNotFound(true)
    }, 6000)

    return () => clearTimeout(timer)
  }, [id, result, isConnected])

  const formattedDate = useMemo(() => {
    if (!result?.date) return ""
    try {
      const date = new Date(result.date)
      return new Intl.DateTimeFormat(i18n.language, {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(date)
    } catch {
      return result.date
    }
  }, [result?.date, i18n.language])

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(t("results:share.copied"))
    } catch {
      toast.error(t("manager:result.share.copyFailed"))
    }
  }

  const handleShareClick = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: result?.subject || "Standings",
          url: window.location.href,
        })
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          await copyToClipboard()
        }
      }
    } else {
      await copyToClipboard()
    }
  }

  if (notFound) {
    return (
      <Background field="cream">
        <div className="z-10 mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="text-base font-semibold leading-relaxed text-gray-700">
            {t("results:share.notFound")}
          </p>
        </div>
      </Background>
    )
  }

  if (!result) {
    return (
      <Background field="cream">
        <div className="z-10 flex flex-col items-center gap-4">
          <Loader className="size-12 text-[color:var(--color-field-ink)]" />
          <p className="text-lg font-semibold tracking-wide animate-pulse">
            {t("results:share.loading")}
          </p>
        </div>
      </Background>
    )
  }

  const top3 = result.players ? result.players.slice(0, 3) : []
  const restPlayers = result.players ? result.players.slice(3) : []
  const winner = result.players?.[0]

  return (
    <Background field="cream">
      {result && !reducedMotion && (
        <Suspense fallback={null}>
          <ReactConfetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={300}
            className="pointer-events-none fixed inset-0 z-50"
          />
        </Suspense>
      )}

      <div className="z-10 flex w-full max-w-3xl flex-col items-center px-4 pt-6 pb-20">
        <header className="mb-8 text-center">
          <p className="text-xs font-semibold tracking-wide uppercase text-[color:var(--color-field-ink)]/70">
            {t("results:share.title")}
          </p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl lg:text-5xl">
            {result.subject}
          </h2>
          <p className="mt-2 text-sm text-[color:var(--color-field-ink)]/80">
            {formattedDate}
          </p>
        </header>

        <div className="flex w-full max-w-xl h-72 md:h-80 items-end justify-center gap-2 md:gap-4 px-2">
          {top3[1] && (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reducedMotion
                  ? undefined
                  : { duration: 0.5, ease: "easeOut", delay: 0.35 }
              }
              className="flex w-1/3 max-w-[10rem] flex-col items-center gap-2"
              style={{ height: "75%" }}
            >
              <p className="max-w-full truncate text-center text-sm font-bold text-[color:var(--color-field-ink)] md:text-base px-1">
                {top3[1].username}
              </p>
              <div className="flex w-full flex-1 flex-col items-center justify-between rounded-t-xl bg-[var(--color-accent)] pt-4 pb-3 shadow-lg">
                <Medal rank={2} />
                <p className="text-lg font-bold text-[var(--accent-contrast-text)] tabular-nums md:text-xl">
                  {top3[1].points}
                </p>
              </div>
            </motion.div>
          )}

          {top3[0] && (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reducedMotion
                  ? undefined
                  : { duration: 0.5, ease: "easeOut", delay: 0.6 }
              }
              className="z-10 flex w-1/3 max-w-[10rem] flex-col items-center gap-2"
              style={{ height: "90%" }}
            >
              <p className="max-w-full truncate text-center text-base font-bold text-[color:var(--color-field-ink)] md:text-lg px-1">
                {top3[0].username}
              </p>
              <div className="flex w-full flex-1 flex-col items-center justify-between rounded-t-xl bg-[var(--color-accent)] pt-4 pb-4 shadow-xl border-t-2 border-yellow-400/20">
                <Medal rank={1} />
                <p className="text-xl font-extrabold text-[var(--accent-contrast-text)] tabular-nums md:text-2xl">
                  {top3[0].points}
                </p>
              </div>
            </motion.div>
          )}

          {top3[2] && (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reducedMotion
                  ? undefined
                  : { duration: 0.5, ease: "easeOut", delay: 0.15 }
              }
              className="flex w-1/3 max-w-[10rem] flex-col items-center gap-2"
              style={{ height: "60%" }}
            >
              <p className="max-w-full truncate text-center text-xs font-bold text-[color:var(--color-field-ink)] md:text-sm px-1">
                {top3[2].username}
              </p>
              <div className="flex w-full flex-1 flex-col items-center justify-between rounded-t-xl bg-[var(--color-accent)] pt-4 pb-3 shadow-lg">
                <Medal rank={3} />
                <p className="text-base font-bold text-[var(--accent-contrast-text)] tabular-nums md:text-lg">
                  {top3[2].points}
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {restPlayers.length > 0 && (
          <div className="mt-8 flex w-full max-w-xl flex-col gap-2 px-2">
            {restPlayers.map((player, idx) => {
              const displayRank = player.rank || (idx + 4)
              return (
                <motion.div
                  key={player.username + idx}
                  initial={reducedMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    reducedMotion
                      ? undefined
                      : { duration: 0.3, delay: idx * 0.05 + 0.8 }
                  }
                  className="flex w-full justify-between items-center rounded-xl bg-[var(--color-accent)] px-4 py-3 text-lg font-bold text-[var(--accent-contrast-text)] shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-full bg-white/20 text-xs font-extrabold">
                      {displayRank}
                    </span>
                    <span className="truncate drop-shadow-sm">{player.username}</span>
                  </div>
                  <span className="tabular-nums drop-shadow-sm">
                    {player.points}
                  </span>
                </motion.div>
              )
            })}
          </div>
        )}

        <Button
          variant="secondary"
          size="lg"
          onClick={handleShareClick}
          className="mt-8 rounded-2xl"
        >
          <Share2 className="size-5" aria-hidden />
          <span>{t("results:share.copyLink")}</span>
        </Button>

        {/* ── Host-conversion CTA ── A stranger landing on /r/:id can spin up
            their own game (primary) or self-host the project (quiet). */}
        <div className="mt-10 flex w-full max-w-xs flex-col items-center gap-3">
          {winner && (
            <WinnerStickerButton
              name={winner.username}
              points={winner.points}
              subject={result.subject}
            />
          )}

          <a
            href="/"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-center text-base font-bold text-white shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/60 focus-visible:outline-none"
          >
            {t("results:share.playSelf")}
          </a>

          <a
            href="https://github.com/joehomeskillet/Razzoozle"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40 focus-visible:outline-none"
          >
            {t("results:share.hostYourOwn")}
          </a>
        </div>
      </div>
    </Background>
  )
}

export default SharePage
