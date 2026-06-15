import Background from "@razzoozle/web/components/Background"
import Button from "@razzoozle/web/components/Button"
import Card from "@razzoozle/web/components/Card"
import {
  type ErrorVariant,
  pickQuote,
} from "@razzoozle/web/components/errorQuotes"
import { useNavigate } from "@tanstack/react-router"
import clsx from "clsx"
import { ChevronDown, Ghost, ServerCrash, Unplug, Bug } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import {
  type ReactElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

type Props = {
  variant: ErrorVariant
  // Optional framing overrides. When omitted, both are sourced from i18n via the
  // per-variant framing keys (errors:<variant>.{title,description}). Existing
  // callers that pass explicit strings keep working unchanged.
  title?: string
  description?: string
  // Technical text (e.g. error.message). Rendered DEZENT, behind a collapsible
  // — never as a dominant raw stacktrace.
  detail?: string
  // Custom back handler. When omitted, the button navigates to "/".
  onBack?: () => void
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

// ─────────────────────────────────────────────────────────────────────────────
// 404 — "verloren im Void": a small cluster of glyphs that drift and wander off,
// looping. Reduced-motion → a single calm, static glyph.
// ─────────────────────────────────────────────────────────────────────────────
const DRIFTERS = ["?", "404", "·", "?", "·"] as const

const NotFoundAnim = ({ reduced }: { reduced: boolean }) => {
  const drifters = useMemo(
    () =>
      DRIFTERS.map((glyph, i) => ({
        glyph,
        left: rand(8, 78),
        top: rand(6, 70),
        size: rand(1.4, 3.4),
        delay: rand(0, 2.4),
        duration: rand(5, 8),
        drift: rand(40, 120),
        rotate: rand(-20, 20),
        key: i,
      })),
    [],
  )

  if (reduced) {
    return (
      <div className="relative h-28 w-full" aria-hidden>
        <Ghost className="absolute top-1/2 left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 text-[var(--color-primary)] opacity-80" />
      </div>
    )
  }

  return (
    <div className="relative h-28 w-full overflow-hidden" aria-hidden>
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        animate={{ y: [0, -8, 0], rotate: [-3, 3, -3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Ghost className="size-14 text-[var(--color-primary)]" />
      </motion.div>
      {drifters.map((d) => (
        <motion.span
          key={d.key}
          className="absolute font-extrabold text-[var(--color-primary)] opacity-70 select-none"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            fontSize: `${d.size}rem`,
          }}
          initial={{ opacity: 0, x: 0, y: 0 }}
          animate={{
            opacity: [0, 0.7, 0.7, 0],
            x: [0, d.drift],
            y: [0, -d.drift * 0.6],
            rotate: [0, d.rotate],
          }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: "easeInOut",
            times: [0, 0.2, 0.7, 1],
          }}
        >
          {d.glyph}
        </motion.span>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4xx — "du hast (sanft) was kaputtgemacht": a wobbling, confused glitch.
// ─────────────────────────────────────────────────────────────────────────────
const ClientAnim = ({ reduced }: { reduced: boolean }) => {
  if (reduced) {
    return (
      <div className="relative h-28 w-full" aria-hidden>
        <Unplug className="absolute top-1/2 left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 text-amber-500 opacity-90" />
      </div>
    )
  }

  return (
    <div className="relative h-28 w-full" aria-hidden>
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        animate={{
          rotate: [-8, 8, -5, 6, -8],
          x: [0, -3, 4, -2, 0],
          scale: [1, 1.04, 0.97, 1.02, 1],
        }}
        transition={{
          duration: 2.4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <Unplug className="size-14 text-amber-500" />
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5xx — "Kernel Panic": CRT-glitch / flicker plus a short shake.
// ─────────────────────────────────────────────────────────────────────────────
const ServerAnim = ({ reduced }: { reduced: boolean }) => {
  if (reduced) {
    return (
      <div className="relative h-28 w-full" aria-hidden>
        <ServerCrash className="absolute top-1/2 left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 text-red-500 opacity-90" />
      </div>
    )
  }

  return (
    <div className="relative h-28 w-full overflow-hidden" aria-hidden>
      {/* CRT scanline flicker overlay */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px)",
        }}
        animate={{ opacity: [0.2, 0.6, 0.15, 0.7, 0.3] }}
        transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        animate={{
          x: [0, -2, 3, -3, 2, 0],
          y: [0, 1, -2, 2, -1, 0],
          opacity: [1, 0.75, 1, 0.85, 1],
          filter: [
            "none",
            "drop-shadow(2px 0 0 rgba(255,0,80,0.7)) drop-shadow(-2px 0 0 rgba(0,200,255,0.7))",
            "none",
          ],
        }}
        transition={{
          duration: 0.35,
          repeat: Infinity,
          repeatDelay: 1.2,
          ease: "easeInOut",
        }}
      >
        <ServerCrash className="size-14 text-red-500" />
      </motion.div>
    </div>
  )
}

const GenericAnim = ({ reduced }: { reduced: boolean }) => {
  if (reduced) {
    return (
      <div className="relative h-28 w-full" aria-hidden>
        <Bug className="absolute top-1/2 left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 text-[var(--color-primary)] opacity-90" />
      </div>
    )
  }

  return (
    <div className="relative h-28 w-full" aria-hidden>
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        animate={{ rotate: [0, 12, -12, 0], y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <Bug className="size-14 text-[var(--color-primary)]" />
      </motion.div>
    </div>
  )
}

const ANIMS: Record<
  ErrorVariant,
  (props: { reduced: boolean }) => ReactElement
> = {
  notFound: NotFoundAnim,
  client: ClientAnim,
  server: ServerAnim,
  generic: GenericAnim,
}

const AnimatedErrorPage = ({
  variant,
  title,
  description,
  detail,
  onBack,
}: Props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduced = useReducedMotion() ?? false

  // Pick the quote once per mount so it stays stable across re-renders but is
  // re-rolled on remount/navigation. Sourced from i18n (active language) via
  // pickQuote.
  const quote = useMemo(() => pickQuote(variant), [variant])

  // Framing (title/description): explicit props win; otherwise fall back to the
  // per-variant i18n framing keys so each variant shows localized copy.
  const resolvedTitle = title ?? t(`errors:${variant}.title`)
  const resolvedDescription = description ?? t(`errors:${variant}.description`)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const detailId = useId()
  const [detailOpen, setDetailOpen] = useState(false)

  // Move focus to the heading on mount so screen-reader / keyboard users land
  // on the error context immediately.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const Anim = ANIMS[variant] ?? GenericAnim

  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }
    navigate({ to: "/" })
  }

  return (
    <Background>
      {/* Region semantics live on the inner <section> (Card takes no role
          props); see aria-labelledby below. */}
      <Card className="max-w-md items-center gap-4 text-center">
        <section
          aria-labelledby={headingId}
          className="flex w-full flex-col items-center gap-4"
        >
          <Anim reduced={reduced} />

          <div className="flex flex-col gap-1">
            <h1
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-bold text-gray-800 outline-none"
            >
              {resolvedTitle}
            </h1>
            {resolvedDescription && (
              <p className="text-sm text-gray-500">{resolvedDescription}</p>
            )}
          </div>

          <p className="text-base font-medium text-gray-600 italic">
            {`„${quote}"`}
          </p>

          {detail && (
            <div className="w-full">
              <button
                type="button"
                onClick={() => setDetailOpen((v) => !v)}
                aria-expanded={detailOpen}
                aria-controls={detailId}
                className="mx-auto flex min-h-11 items-center gap-1 rounded-md px-3 text-sm text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              >
                <ChevronDown
                  className={clsx(
                    "size-4 transition-transform",
                    detailOpen && "rotate-180",
                  )}
                />
                {t("errors:detail.toggle", "Technische Details")}
              </button>
              {detailOpen && (
                <pre
                  id={detailId}
                  className="mt-2 max-h-48 overflow-auto rounded-md bg-gray-100 px-3 py-2 text-left font-mono text-xs break-words whitespace-pre-wrap text-gray-500"
                >
                  {detail}
                </pre>
              )}
            </div>
          )}

          <Button size="lg" onClick={handleBack}>
            {t("errors:back", "Zurück zur Startseite")}
          </Button>
        </section>
      </Card>
    </Background>
  )
}

export default AnimatedErrorPage
