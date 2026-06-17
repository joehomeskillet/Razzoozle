import defaultLogo from "@razzoozle/web/assets/logo.svg"
import GithubIcon from "@razzoozle/web/components/GithubIcon"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import { type PropsWithChildren } from "react"

// `plain` is kept for API compatibility but no longer changes the visuals: the
// page background is now painted exclusively by the single cream gradient on
// <body>. Background never paints a full-bleed page background of its own —
// neither the themed photo wallpaper, the brand gradient, nor the dark scrim —
// so the one body bg shows through consistently on every screen.
const Background = ({
  children,
  field = "ink",
}: PropsWithChildren<{ plain?: boolean; field?: "cream" | "ink" }>) => {
  const { theme } = useThemeStore()
  const appTitle = theme.appTitle?.trim()
  const isCream = field === "cream"

  return (
    // `justify-center-safe` (safe center): short pages (login/lobby/loader) stay
    // vertically centred, but when content is taller than the viewport — e.g. the
    // full /trophies gallery on a phone — it falls back to top alignment instead
    // of centring the overflow above the scroll origin. Plain `justify-center`
    // clips the top out of reach on mobile, trapping the page (no scroll-up).
    <section
      className="relative flex min-h-dvh flex-col items-center justify-center-safe touch-pan-y"
      style={isCream ? { color: "var(--color-field-ink)" } : undefined}
    >
      {/* Brand above the login: a custom uploaded logo wins; otherwise show the
          themed appTitle as text (e.g. "Südhang Kahoot"); fall back to the
          bundled logo only when neither is set. */}
      {theme.logo ? (
        <>
          <img
            src={theme.logo}
            className="z-10 mb-10 h-16"
            alt={appTitle ?? "logo"}
          />
          <h1 className="sr-only">{appTitle ?? "Razzoozle"}</h1>
        </>
      ) : appTitle ? (
        <h1
          className={`z-10 mb-10 text-center text-4xl font-extrabold tracking-tight md:text-5xl ${
            isCream ? "text-[color:var(--color-field-ink)]" : "text-white drop-shadow-lg"
          }`}
        >
          {appTitle}
        </h1>
      ) : (
        <>
          <img src={defaultLogo} className="z-10 mb-10 h-16" alt="logo" />
          <h1 className="sr-only">{appTitle ?? "Razzoozle"}</h1>
        </>
      )}
      {children}

      {theme.showBranding && (
        <a
          href="https://github.com/joehomeskillet/Razzoozle"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 text-sm font-semibold text-white/50 transition-colors hover:text-white/80"
        >
          <GithubIcon size={14} />
          {/* oxlint-disable-next-line no-undef */}
          Razzoozle - v{__APP_VERSION__}
        </a>
      )}
    </section>
  )
}

export default Background
