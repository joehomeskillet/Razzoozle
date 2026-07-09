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
  align = "center",
}: PropsWithChildren<{
  plain?: boolean
  field?: "cream" | "ink"
  align?: "center" | "top"
}>) => {
  const { theme } = useThemeStore()
  const appTitle = theme.appTitle?.trim()
  const isCream = field === "cream"

  return (
    // h-dvh + overflow-hidden keeps this root locked to the viewport so the
    // body (touch-none) never scrolls. Center pages (landing etc.) stay
    // vertically centered via justify-center-safe and fit without overflow.
    // /trophies (align="top") supplies its own internal scroll container as
    // a direct flex child after the logo (flex min-h-0 flex-1 overflow-y-auto).
    <section
      className={`relative flex h-dvh flex-col items-center overflow-hidden ${
        align === "top" ? "pt-8" : "justify-center-safe"
      }`}
      style={isCream ? { color: "var(--color-field-ink)" } : undefined}
    >
      {/* Brand above the login: a custom uploaded logo wins; otherwise show the
          themed appTitle as text; fall back to the bundled logo only when
          neither is set. */}
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
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 text-sm font-semibold text-[color:var(--color-primary)] transition hover:brightness-125"
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
