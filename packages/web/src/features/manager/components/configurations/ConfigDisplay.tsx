import {
  CircleHelp,
  Clock,
  Keyboard,
  Monitor,
  Smartphone,
  Wifi,
  XCircle,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import { useTranslation } from "react-i18next"

// The "Satellit" config tab. Pairing itself needs a live game (gameId +
// manager password), so this tab is the discoverable entry point that explains
// the beamer/Pi-satellite model and that the phone is the remote control; the
// actual pairing happens from the in-game header control (DisplayControl) once
// a game is running.
//
// Many hosts are not technical (UX audit), so the stepper spells out the
// code-enter → test flow in plain language and a troubleshooting block maps the
// known DISPLAY.PAIR_ERROR causes (display.ts) to laienverständliche hints.
const ConfigDisplay = () => {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

  // Stepper: each step names what to do AND what you should see, so the
  // "enter code, then it connects" flow is unambiguous even for non-techies.
  const steps = [
    {
      icon: Monitor,
      text: t("manager:satellite.step1"),
      result: t("manager:satellite.step1Result", {
        defaultValue:
          "Du siehst dann auf dem grossen Bildschirm einen 6-stelligen Code wie «ABC123».",
      }),
    },
    {
      icon: Keyboard,
      text: t("manager:satellite.step2Enter", {
        defaultValue:
          "Starte ein Spiel und tippe oben im Spielkopf auf «Satellit». Gib dort den Code ein, der auf dem grossen Bildschirm steht.",
      }),
      result: t("manager:satellite.step2Result", {
        defaultValue:
          "Tippe auf «Koppeln», um die Verbindung zu testen. Klappt es, erscheint «Anzeige gekoppelt».",
      }),
    },
    {
      icon: Smartphone,
      text: t("manager:satellite.step3"),
      result: null,
    },
  ]

  // Plain-language causes for every PAIR_ERROR the server can emit
  // (packages/socket/src/handlers/display.ts). No error codes shown to the
  // host — just what likely went wrong and the one thing to try.
  const troubleshooting = [
    {
      icon: Clock,
      // → errors:display.invalidCode (wrong/expired) — the most common case.
      text: t("manager:satellite.troubleCode", {
        defaultValue:
          "«Ungültiger oder abgelaufener Code»: Der Code stimmt nicht oder ist zu alt (er gilt nur 5 Minuten). Lade die /display-Seite auf dem grossen Bildschirm neu – sie zeigt dann einen frischen Code – und tippe ihn genau so ab, wie er dort steht.",
      }),
    },
    {
      icon: Wifi,
      // → errors:display.notConnected (satellite socket gone).
      text: t("manager:satellite.troubleNotConnected", {
        defaultValue:
          "«Anzeige nicht verbunden»: Der Beamer oder Pi hat die Verbindung verloren. Prüfe, ob er noch im Internet ist, und lade die /display-Seite neu. Bei einem eigenen Netzwerk kann eine Firewall blockieren – dann müssen die Ports für razzoozle.joelduss.xyz freigegeben sein.",
      }),
    },
    {
      icon: XCircle,
      // → errors:game.notFound / manager.invalidPassword / failedToReadConfig.
      text: t("manager:satellite.troubleGame", {
        defaultValue:
          "«Spiel nicht gefunden» oder «Passwort ungültig»: Die Kopplung geht nur, solange dein Spiel läuft und du als Spielleiter angemeldet bist. Starte das Spiel neu oder melde dich erneut an und versuche es dann gleich noch einmal.",
      }),
    },
  ]

  return (
    <>
      <div className="mb-4">
        <PageHeader
          title={t("manager:satellite.title")}
          subtitle={t("manager:satellite.description")}
        />
      </div>

      <motion.div
      className="flex min-h-0 flex-1 flex-col gap-4 p-0.5"
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
      }
    >
      <p className="text-sm leading-relaxed text-[var(--ink-medium)]">
        {t("manager:satellite.description")}
      </p>

      <ol className="flex flex-col gap-3">
        {steps.map(({ icon: Icon, text, result }, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-[var(--radius-theme)] bg-[var(--surface-2)] p-4 outline-2 -outline-offset-2 outline-[var(--border-hairline)]"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-contrast)] text-sm font-bold text-white"> {/* token-ok: white-on-accent-contrast, AA per tokens.css §design.md */}
              {i + 1}
            </span>
            <Icon
              className="mt-0.5 size-5 shrink-0 text-[var(--ink-faint)]"
              aria-hidden
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm leading-snug text-[var(--ink-muted)]">{text}</span>
              {result && (
                <span className="text-xs leading-snug text-[var(--ink-subtle)]">
                  {result}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="rounded-[var(--radius-theme)] bg-[var(--color-accent)]/10 p-4 text-xs leading-snug text-[var(--ink-muted)]">
        {t("manager:satellite.hint")}
      </p>

      <section
        aria-labelledby="satellite-trouble-heading"
        className="flex flex-col gap-2"
      >
        <h3
          id="satellite-trouble-heading"
          className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-muted)]"
        >
          <CircleHelp className="size-4 shrink-0 text-[var(--color-accent)]" aria-hidden />
          {t("manager:satellite.troubleTitle", {
            defaultValue: "Wenn die Kopplung nicht klappt",
          })}
        </h3>
        <ul className="flex flex-col gap-2">
          {troubleshooting.map(({ icon: Icon, text }, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-[var(--radius-theme)] bg-[var(--surface-2)] p-3 outline-2 -outline-offset-2 outline-[var(--border-hairline)]"
            >
              <Icon
                className="mt-0.5 size-4 shrink-0 text-[var(--ink-faint)]"
                aria-hidden
              />
              <span className="text-xs leading-snug text-[var(--ink-medium)]">{text}</span>
            </li>
          ))}
        </ul>
      </section>
      </motion.div>
    </>
  )
}

export default ConfigDisplay
